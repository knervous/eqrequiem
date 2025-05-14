package server

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time" // Added for grace period

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

type Server struct {
	wtServer       *webtransport.Server
	zoneManager    *world.ZoneManager
	worldHandler   *world.WorldHandler
	sessionManager *session.SessionManager
	sessions       map[int]*webtransport.Session
	udpConn        *net.UDPConn
	gracePeriod    time.Duration // New: grace period for session cleanup
	debugMode      bool          // New: disable cleanup for debugging
}

// NewServer creates a new server with the given DSN and configuration.
func NewServer(dsn string, gracePeriod time.Duration, debugMode bool) (*Server, error) {
	registry := world.NewWorldOpCodeRegistry()
	zoneManager := world.NewZoneManager()
	sessionManager := session.NewSessionManager()
	session.InitSessionManager(sessionManager)
	worldHandler := world.NewWorldHandler(zoneManager, sessionManager)
	registry.WH = worldHandler

	err := cache.Init()
	if err != nil {
		return nil, fmt.Errorf("failed to initialize cache: %w", err)
	}

	return &Server{
		zoneManager:    zoneManager,
		worldHandler:   worldHandler,
		sessionManager: sessionManager,
		sessions:       make(map[int]*webtransport.Session),
		gracePeriod:    gracePeriod, // e.g., 30 seconds
		debugMode:      debugMode,   // Enable for debugging
	}, nil
}

func (s *Server) SendStream(sessionID int, data []byte) error {
	sess, ok := s.sessions[sessionID]
	if !ok {
		return fmt.Errorf("session %d not found", sessionID)
	}
	stream, err := sess.OpenStream()
	if err != nil {
		return fmt.Errorf("open stream: %w", err)
	}
	defer stream.Close()

	_, err = stream.Write(data)
	return err
}

func (s *Server) SendDatagram(sessionID int, data []byte) error {
	sess, ok := s.sessions[sessionID]
	if !ok {
		return fmt.Errorf("session %d not found", sessionID)
	}

	err := sess.SendDatagram(data)
	if err != nil {
		log.Printf("failed to send datagram: %v", err)
		return fmt.Errorf("send datagram: %w", err)
	}
	return nil
}

func (s *Server) StartServer() {
	tlsConf, err := cert.LoadTLSConfig()
	if err != nil {
		log.Printf("failed to load TLS config: %v", err)
		return
	}

	udpConn, port, err := listenUDP(443)
	if err != nil {
		log.Printf("UDP listen error: %v", err)
		return
	}
	s.udpConn = udpConn
	log.Printf("Server bound to UDP port: %d", port)

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
		},
		CheckOrigin: func(_ *http.Request) bool { return true },
	}

	go startHTTPServer(tlsConf)

	http.HandleFunc("/eq", s.makeEQHandler())

	go func() {
		_, cancel := context.WithCancel(context.Background())
		defer cancel()
		log.Printf("Starting WebTransport UDP server on %s", udpConn.LocalAddr())
		if err := s.wtServer.Serve(udpConn); err != nil {
			log.Printf("WebTransport server failed: %v", err)
		}
	}()
}

func listenUDP(port int) (*net.UDPConn, int, error) {
	addr := fmt.Sprintf(":%d", port)
	udpAddr, err := net.ResolveUDPAddr("udp", addr)
	if err != nil {
		return nil, 0, fmt.Errorf("resolve UDP addr %s: %w", addr, err)
	}
	conn, err := net.ListenUDP("udp", udpAddr)
	if err != nil {
		return nil, 0, fmt.Errorf("listen UDP %s: %w", addr, err)
	}
	err = conn.SetReadBuffer(4 * 1024 * 1024)
	if err != nil {
		return nil, 0, fmt.Errorf("set read buffer: %w", err)
	}
	err = conn.SetWriteBuffer(4 * 1024 * 1024)
	if err != nil {
		return nil, 0, fmt.Errorf("set write buffer: %w", err)
	}
	return conn, conn.LocalAddr().(*net.UDPAddr).Port, nil
}

func startHTTPServer(tlsConf *tls.Config) {
	mux := http.NewServeMux()
	mux.Handle("/code", corsMiddleware(http.HandlerFunc(discord.DiscordAuthHandler)))
	mux.HandleFunc("/register", registerHandler)

	listener, err := net.Listen("tcp", ":443")
	if err != nil {
		log.Printf("HTTPS listen error: %v", err)
		return
	}
	tlsListener := tls.NewListener(listener, tlsConf)
	log.Printf("Starting HTTPS server on TCP port 443")
	if err := http.Serve(tlsListener, mux); err != nil {
		log.Printf("HTTPS server failed: %v", err)
	}
}

func registerHandler(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.RemoteAddr, "127.0.0.1:") {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	_ = r.FormValue("zoneId")
	_ = r.FormValue("port")
	_, err := w.Write([]byte("OK"))
	if err != nil {
		log.Printf("Error writing response: %v", err)
	}
}

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

func (s *Server) makeEQHandler() http.HandlerFunc {
	var sessionID int
	return func(rw http.ResponseWriter, r *http.Request) {
		log.Printf("Received /eq request from %s", r.RemoteAddr)
		sess, err := s.wtServer.Upgrade(rw, r)
		if err != nil {
			log.Printf("Upgrade error: %v", err)
			return
		}

		// Extract IP from r.RemoteAddr
		clientIP, _, _ := net.SplitHostPort(r.RemoteAddr)
		params := r.URL.Query()
		var sid int = 0
		var session *session.Session
		if params.Get("sid") != "0" {
			sessionId, err := strconv.Atoi(params.Get("sid"))
			if err != nil {
				sess.CloseWithError(400, "Bad session param")
			}
			ses, err := s.sessionManager.GetValidSession(sessionId, clientIP)
			if err == nil {
				fmt.Printf("Reconnecting session %d from %s", sessionId, clientIP)
				session = ses
				ses.Messenger = s
				ses.SendData(nil, 0)
			}
		}
		if session == nil {
			// New session
			sessionID++
			sid = sessionID
			s.sessions[sid] = sess
			log.Printf("Accepted new WebTransport session %d from %s", sid, clientIP)
			session = s.sessionManager.CreateSession(s, sid, clientIP)
		}

		// Handle datagrams
		go func() {
			ctx := context.Background()
			for {
				data, err := sess.ReceiveDatagram(ctx)
				if err != nil {
					log.Printf("datagram recv closed (sess %d): %v", sid, err)
					s.handleSessionClose(sid, clientIP)
					return
				}
				s.worldHandler.HandlePacket(session, data)
			}
		}()

		// Handle streams
		go func() {
			for {
				strm, err := sess.AcceptStream(sess.Context())
				if err != nil {
					log.Printf("stream accept closed (sess %d): %v", sid, err)
					s.handleSessionClose(sid, clientIP)
					return
				}
				data, _ := io.ReadAll(strm)
				s.worldHandler.HandlePacket(session, data)
				log.Printf("sess %d stream → %d bytes", sid, len(data))
			}
		}()
	}
}

// handleSessionClose manages session cleanup with a grace period for reconnection.
func (s *Server) handleSessionClose(sessionID int, clientIP string) {
	// if s.debugMode {
	// 	log.Printf("Debug mode: keeping session %d alive for %s", sessionID, clientIP)
	// 	return
	// }

	// Start grace period timer
	time.AfterFunc(s.gracePeriod, func() {
		// Check if session was replaced (reconnected)
		if sess, exists := s.sessions[sessionID]; exists && sess.Context().Value("clientIP") == clientIP {
			log.Printf("Session %d still active for %s; skipping cleanup", sessionID, clientIP)
			return
		}

		// Clean up session
		log.Printf("Cleaning up session %d for %s after grace period", sessionID, clientIP)
		delete(s.sessions, sessionID)
		s.sessionManager.RemoveSession(sessionID)
		s.worldHandler.RemoveSession(sessionID)
	})
}

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
