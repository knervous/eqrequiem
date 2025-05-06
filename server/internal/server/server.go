package server

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"

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
}

// NewServer creates a new server with the given DSN.
func NewServer(dsn string) (*Server, error) {
	// Create HandlerRegistry with db.WorldDB
	registry := world.NewWorldOpCodeRegistry()

	// Create ZoneManager with HandlerRegistry
	zoneManager := world.NewZoneManager()

	// Create SessionManager
	sessionManager := session.NewSessionManager()

	// Initialize global SessionManager
	session.InitSessionManager(sessionManager)

	// Create WorldHandler with ZoneManager and SessionManager
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

// Implement world.ClientMessenger
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

// StartServer starts the WebTransport and HTTPS servers.
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

	// Custom QUIC configuration for larger buffers
	quicConf := &quic.Config{
		MaxStreamReceiveWindow:     4 * 1024 * 1024,  // 4MB per stream
		MaxConnectionReceiveWindow: 16 * 1024 * 1024, // 16MB per connection
		MaxIncomingStreams:         1000,             // Adjust based on your needs
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
	// Increase buffer sizes
	err = conn.SetReadBuffer(4 * 1024 * 1024) // 4MB
	if err != nil {
		return nil, 0, fmt.Errorf("set read buffer: %w", err)
	}
	err = conn.SetWriteBuffer(4 * 1024 * 1024) // 4MB
	if err != nil {
		return nil, 0, fmt.Errorf("set write buffer: %w", err)
	}
	return conn, conn.LocalAddr().(*net.UDPAddr).Port, nil
}

// startHTTPServer runs the HTTPS endpoints (/code, /register) on port 443.
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

// registerHandler records zone→port mapping; only from localhost.
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

// corsMiddleware adds CORS headers.
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

// makeEQHandler returns the WebTransport handler.
func (s *Server) makeEQHandler() http.HandlerFunc {
	var sessionID int
	return func(rw http.ResponseWriter, r *http.Request) {
		log.Printf("Received /eq request from %s", r.RemoteAddr)
		sess, err := s.wtServer.Upgrade(rw, r)
		if err != nil {
			log.Printf("Upgrade error: %v", err)
			return
		}

		sessionID++
		sid := sessionID
		s.sessions[sid] = sess
		log.Printf("Accepted WebTransport session %d from %s", sid, r.RemoteAddr)

		// Extract IP from r.RemoteAddr
		ip, _, _ := net.SplitHostPort(r.RemoteAddr)

		// Initialize session with Server as ClientMessenger
		session := s.sessionManager.CreateSession(s, sid, ip)
		// Handle datagrams
		go func() {
			ctx := context.Background()
			for {
				data, err := sess.ReceiveDatagram(ctx)
				if err != nil {
					log.Printf("datagram recv closed (sess %d): %v", sid, err)
					delete(s.sessions, sid)
					s.sessionManager.RemoveSession(sid)
					s.worldHandler.RemoveSession(sid)
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
					return
				}
				data, _ := io.ReadAll(strm)
				s.worldHandler.HandlePacket(session, data)
				log.Printf("sess %d stream → %d bytes", sid, len(data))
			}
		}()
	}
}

// StopServer shuts down the server gracefully.
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
