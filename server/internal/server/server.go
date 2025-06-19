package server

import (
	"context"
	"crypto/tls"
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/knervous/eqgo/internal/cache"
	"github.com/knervous/eqgo/internal/cert"
	"github.com/knervous/eqgo/internal/db"
	"github.com/knervous/eqgo/internal/discord"
	"github.com/knervous/eqgo/internal/session"
	"github.com/knervous/eqgo/internal/world"

	"github.com/quic-go/quic-go"
	"github.com/quic-go/quic-go/http3"
	"github.com/quic-go/webtransport-go"
)

// Server hosts a WebTransport-based world server with both datagrams and a single control stream per session.
type Server struct {
	wtServer       *webtransport.Server
	zoneManager    *world.ZoneManager
	worldHandler   *world.WorldHandler
	sessionManager *session.SessionManager
	sessions       map[int]*webtransport.Session
	udpConn        *net.UDPConn
	gracePeriod    time.Duration
	debugMode      bool
}

// NewServer constructs a new Server.
func NewServer(dsn string, gracePeriod time.Duration, debugMode bool) (*Server, error) {
	registry := world.NewWorldOpCodeRegistry()
	zoneManager := world.NewZoneManager()
	sessionManager := session.NewSessionManager()
	session.InitSessionManager(sessionManager)
	worldHandler := world.NewWorldHandler(zoneManager, sessionManager)
	registry.WH = worldHandler

	if err := cache.Init(); err != nil {
		return nil, fmt.Errorf("failed to initialize cache: %w", err)
	}

	return &Server{
		zoneManager:    zoneManager,
		worldHandler:   worldHandler,
		sessionManager: sessionManager,
		sessions:       make(map[int]*webtransport.Session),
		gracePeriod:    gracePeriod,
		debugMode:      debugMode,
	}, nil
}

// StartServer configures TLS, QUIC, HTTP, and begins serving WebTransport.
func (s *Server) StartServer() {
	// TLS
	tlsConf, err := cert.LoadTLSConfig()
	if err != nil {
		log.Printf("failed to load TLS config: %v", err)
		return
	}

	// UDP
	udpConn, port, err := listenUDP(443)
	if err != nil {
		log.Printf("UDP listen error: %v", err)
		return
	}
	s.udpConn = udpConn
	log.Printf("Server bound to UDP port: %d", port)

	// QUIC
	quicConf := &quic.Config{
		MaxStreamReceiveWindow:     4 * 1024 * 1024,
		MaxConnectionReceiveWindow: 16 * 1024 * 1024,
		MaxIncomingStreams:         1000,
	}

	s.wtServer = &webtransport.Server{
		H3: http3.Server{
			TLSConfig:       tlsConf,
			EnableDatagrams: true,
			QUICConfig:      quicConf,
			Handler:         corsMiddleware(http.DefaultServeMux),
		},
		CheckOrigin: func(_ *http.Request) bool { return true },
	}

	// HTTP handler for OAuth, etc.
	go startHTTPServer(tlsConf)

	// WebTransport endpoint
	http.HandleFunc("/eq", s.makeEQHandler())

	// Serve WebTransport on UDP socket
	go func() {
		_, cancel := context.WithCancel(context.Background())
		defer cancel()
		log.Printf("Starting WebTransport UDP server on %s", udpConn.LocalAddr())
		if err := s.wtServer.Serve(udpConn); err != nil {
			log.Printf("WebTransport server failed: %v", err)
		}
	}()
}

// makeEQHandler upgrades HTTP to WebTransport and manages session lifecycles.
func (s *Server) makeEQHandler() http.HandlerFunc {
	var nextID int
	return func(rw http.ResponseWriter, r *http.Request) {
		log.Printf("Received /eq request from %s", r.RemoteAddr)
		sess, err := s.wtServer.Upgrade(rw, r)
		if err != nil {
			log.Printf("Upgrade error: %v", err)
			return
		}

		clientIP, _, _ := net.SplitHostPort(r.RemoteAddr)
		params := r.URL.Query()

		// Try reconnect
		var sessObj *session.Session
		if sidStr := params.Get("sid"); sidStr != "0" {
			if sid, e := strconv.Atoi(sidStr); e == nil {
				if existing, e2 := s.sessionManager.GetValidSession(sid, clientIP); e2 == nil {
					log.Printf("Reconnecting session %d from %s", sid, clientIP)
					sessObj = existing
					existing.Messenger = s
					existing.SendData(nil, 0)
				}
			}
		}

		// New session
		if sessObj == nil {
			nextID++
			sid := nextID
			s.sessions[sid] = sess

			// Open a single control stream (bidi)
			ctrl, e := sess.OpenStream()
			if e != nil {
				log.Printf("Failed to open control stream: %v", e)
				sess.CloseWithError(400, "ctrl stream failed")
				return
			}

			log.Printf("Accepted new session %d", sid)
			sessObj = s.sessionManager.CreateSession(s, sid, clientIP, ctrl)

			// Start control stream reader
			go s.handleControlStream(sessObj, ctrl, sid, clientIP)
		}

		// Start datagram reader
		go s.handleDatagrams(sessObj, sess)
	}
}

// handleDatagrams reads incoming datagrams forever.
func (s *Server) handleDatagrams(sessObj *session.Session, sess *webtransport.Session) {
	ctx := context.Background()
	for {
		data, err := sess.ReceiveDatagram(ctx)
		if err != nil {
			log.Printf("datagram recv closed (sess %d): %v", sessObj.SessionID, err)
			s.handleSessionClose(sessObj.SessionID)
			return
		}
		s.worldHandler.HandlePacket(sessObj, data)
	}
}

// handleControlStream parses length-prefixed frames on the single bidi stream.
func (s *Server) handleControlStream(
	sessObj *session.Session,
	ctrl io.ReadWriteCloser,
	sid int,
	clientIP string,
) {
	defer ctrl.Close()
	for {
		// read length prefix
		var lenBuf [4]byte
		if _, err := io.ReadFull(ctrl, lenBuf[:]); err != nil {
			log.Printf("ctrl read len error (sess %d): %v", sid, err)
			s.handleSessionClose(sid)
			return
		}
		n := binary.LittleEndian.Uint32(lenBuf[:])

		// read payload
		payload := make([]byte, n)
		if _, err := io.ReadFull(ctrl, payload); err != nil {
			log.Printf("ctrl read payload error (sess %d): %v", sid, err)
			s.handleSessionClose(sid)
			return
		}

		// dispatch
		s.worldHandler.HandlePacket(sessObj, payload)
		log.Printf("sess %d control → %d bytes", sid, len(payload))
	}
}

// SendStream writes data to a session's control stream.
func (s *Server) SendStream(sessionID int, data []byte) error {
	sessObj, ok := s.sessionManager.GetSession(sessionID)
	if !ok {
		return fmt.Errorf("session %d not found", sessionID)
	}
	_, err := sessObj.ControlStream.Write(data)
	return err
}

// SendDatagram fires a datagram packet to a client.
func (s *Server) SendDatagram(sessionID int, data []byte) error {
	sess, ok := s.sessions[sessionID]
	if !ok {
		return fmt.Errorf("session %d not found", sessionID)
	}
	if err := sess.SendDatagram(data); err != nil {
		log.Printf("failed to send datagram: %v", err)
		return err
	}
	return nil
}

// handleSessionClose schedules removal after gracePeriod.
func (s *Server) handleSessionClose(sessionID int) {
	s.worldHandler.RemoveSession(sessionID)
	log.Printf("Cleaned up session %d", sessionID)
}

// StopServer tears down all listeners and connections.
func (s *Server) StopServer() {
	if s.wtServer != nil {
		s.wtServer.Close()
	}
	if s.udpConn != nil {
		s.udpConn.Close()
	}
	s.zoneManager.Shutdown()
	if db.GlobalWorldDB != nil {
		db.GlobalWorldDB.DB.Close()
	}
}

// listenUDP binds to the given port.
func listenUDP(port int) (*net.UDPConn, int, error) {
	addr := fmt.Sprintf(":%d", port)
	udpAddr, err := net.ResolveUDPAddr("udp", addr)
	if err != nil {
		return nil, 0, err
	}
	conn, err := net.ListenUDP("udp", udpAddr)
	if err != nil {
		return nil, 0, err
	}
	conn.SetReadBuffer(4 * 1024 * 1024)
	conn.SetWriteBuffer(4 * 1024 * 1024)
	return conn, conn.LocalAddr().(*net.UDPAddr).Port, nil
}

// startHTTPServer serves HTTPS for other endpoints.
func startHTTPServer(tlsConf *tls.Config) {
	mux := http.NewServeMux()
	mux.Handle("/code", corsMiddleware(http.HandlerFunc(discord.DiscordAuthHandler)))
	mux.HandleFunc("/register", registerHandler)

	mux.Handle("/online", corsMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("Received /online request from %s", r.RemoteAddr)
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Server is online"))
	})))

	listener, err := net.Listen("tcp", ":443")
	if err != nil {
		log.Printf("HTTPS listen error: %v", err)
		return
	}
	tlsListener := tls.NewListener(listener, tlsConf)
	log.Printf("Starting HTTPS server on TCP port 443")
	http.Serve(tlsListener, mux)
}

// registerHandler is used by internal services.
func registerHandler(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.RemoteAddr, "127.0.0.1:") {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	w.Write([]byte("OK"))
}

// corsMiddleware enables CORS for HTTP endpoints.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Max-Age", "86400")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
