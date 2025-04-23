package cert

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"embed"
	_ "embed"
	b64 "encoding/base64"
	"encoding/binary"
	"encoding/pem"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/quic-go/quic-go/http3"
)

//go:embed keys/key.pem
var keyPEMData embed.FS

// GenerateCertAndStartServer generates a certificate and starts an HTTP server with the hash
func GenerateCertAndStartServer() ([]byte, []byte) {
	tlsConf, x509AsBytes, err := getTLSConf(time.Now(), time.Now().Add(10*24*time.Hour))
	if err != nil {
		log.Fatal(err)
	}
	cert := tlsConf.Certificates[0]
	hash := sha256.Sum256(cert.Leaf.Raw)
	go runHTTPServer(7100, hash)

	derBuf, _ := x509.MarshalECPrivateKey(cert.PrivateKey.(*ecdsa.PrivateKey))

	pem1 := pem.EncodeToMemory(&pem.Block{
		Type:  "CERTIFICATE",
		Bytes: x509AsBytes,
	})

	priv := pem.EncodeToMemory(&pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: derBuf,
	})

	return pem1, priv
}

// GenerateTLSConfig creates a tls.Config from certificate and key PEM data.
func GenerateTLSConfig(certPEM, keyPEM []byte) (*tls.Config, error) {
	cert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return nil, err
	}
	return &tls.Config{
		Certificates: []tls.Certificate{cert},
		NextProtos:   []string{http3.NextProtoH3, "h2", "http/1.1"},
	}, nil
}

// LoadTLSConfig loads TLS config, preferring embedded key.pem if available, falling back to dynamic generation
func LoadTLSConfig() (*tls.Config, error) {
	// Try embedded key.pem first
	tlsConf, err := loadEmbeddedTLSConfig()

	// Fallback to dynamic generation
	certPEM, keyPEM := GenerateCertAndStartServer()
	tlsConf, err = GenerateTLSConfig(certPEM, keyPEM)
	if err != nil {
		return nil, fmt.Errorf("failed to generate dynamic TLS config: %v", err)
	}
	return tlsConf, nil
}

// loadEmbeddedTLSConfig loads TLS config from embedded key.pem, supporting both single cert and PEM chain
func loadEmbeddedTLSConfig() (*tls.Config, error) {
	// Read the embedded file
	pemData, err := keyPEMData.ReadFile("keys/key.pem")
	if err != nil {
		return nil, fmt.Errorf("failed to read embedded key.pem: %v", err)
	}

	// Parse all PEM blocks
	var certPEM, keyPEM []byte
	var certCount int
	rest := pemData
	for {
		block, next := pem.Decode(rest)
		if block == nil {
			if len(rest) > 0 {
				return nil, fmt.Errorf("invalid PEM block in key.pem, remaining data: %s", string(rest))
			}
			break
		}
		switch block.Type {
		case "CERTIFICATE":
			// Append to certPEM, supporting multiple certificates in a chain
			certPEM = append(certPEM, pem.EncodeToMemory(block)...)
			certCount++
		case "PRIVATE KEY", "RSA PRIVATE KEY", "EC PRIVATE KEY":
			// Only one key expected, use the last one if multiple (unlikely)
			keyPEM = pem.EncodeToMemory(block)
		default:
			return nil, fmt.Errorf("unexpected PEM block type: %s", block.Type)
		}
		rest = next
	}

	if certCount == 0 {
		return nil, fmt.Errorf("no CERTIFICATE block found in key.pem")
	}
	if len(keyPEM) == 0 {
		return nil, fmt.Errorf("no PRIVATE KEY block found in key.pem")
	}

	return GenerateTLSConfig(certPEM, keyPEM)
}

func runHTTPServer(port int, certHash [32]byte) {
	mux := http.NewServeMux()
	fmt.Printf("Starting hash server on port %d\n", port)
	mux.HandleFunc("/hash", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte(b64.StdEncoding.EncodeToString(certHash[:])))
	})
	err := http.ListenAndServe(fmt.Sprintf(":%d", port), mux)
	if err != nil {
		fmt.Println("Got error starting hash server")
		fmt.Println(err)
		panic(err)
	}
}

func getTLSConf(start, end time.Time) (*tls.Config, []byte, error) {
	cert, bytes, priv, err := generateCert(start, end)
	if err != nil {
		return nil, nil, err
	}

	return &tls.Config{
		Certificates: []tls.Certificate{{
			Certificate: [][]byte{cert.Raw},
			PrivateKey:  priv,
			Leaf:        cert,
		}},
	}, bytes, nil
}

func generateCert(start, end time.Time) (*x509.Certificate, []byte, *ecdsa.PrivateKey, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return nil, nil, nil, err
	}
	serial := int64(binary.BigEndian.Uint64(b))
	if serial < 0 {
		serial = -serial
	}
	certTempl := &x509.Certificate{
		SerialNumber:          big.NewInt(serial),
		Subject:               pkix.Name{},
		NotBefore:             start,
		NotAfter:              end,
		IsCA:                  true,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth, x509.ExtKeyUsageServerAuth},
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign,
		BasicConstraintsValid: true,
	}
	caPrivateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, nil, nil, err
	}
	caBytes, err := x509.CreateCertificate(rand.Reader, certTempl, certTempl, &caPrivateKey.PublicKey, caPrivateKey)
	if err != nil {
		return nil, nil, nil, err
	}
	ca, err := x509.ParseCertificate(caBytes)
	if err != nil {
		return nil, nil, nil, err
	}
	return ca, caBytes, caPrivateKey, nil
}

func formatByteSlice(b []byte) string {
	s := strings.ReplaceAll(fmt.Sprintf("%#v", b[:]), "[]byte{", "[")
	s = strings.ReplaceAll(s, "}", "]")
	return s
}
