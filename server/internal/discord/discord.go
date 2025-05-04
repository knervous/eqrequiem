package discord

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/knervous/eqgo/internal/config"

	"github.com/golang-jwt/jwt/v5"
)

// AuthRequest represents the expected JSON payload.
type AuthRequest struct {
	Code        string `json:"code"`
	ClientID    string `json:"client_id"`
	RedirectURI string `json:"redirect_uri"`
}

// DiscordAuthHandler processes the Discord OAuth flow via a POST request.
func DiscordAuthHandler(w http.ResponseWriter, r *http.Request) {
	startTime := time.Now()
	log.Println("Received Discord OAuth request")

	// Ensure the method is POST.
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed; use POST", http.StatusMethodNotAllowed)
		log.Println("Method not allowed:", r.Method)
		return
	}

	// Decode the JSON request body.
	var reqData AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&reqData); err != nil {
		http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
		log.Println("Error decoding JSON payload:", err)
		return
	}
	log.Printf("Request payload: %+v\n", reqData)

	// Validate required parameters.
	if reqData.Code == "" || reqData.ClientID == "" || reqData.RedirectURI == "" {
		http.Error(w, "Missing one or more required fields: code, client_id, redirect_uri", http.StatusBadRequest)
		log.Println("Missing required fields in request")
		return
	}

	// Get the Discord secret key from the embedded file.
	clientSecret, err := config.GetDiscordKey()
	if err != nil {
		http.Error(w, "Server configuration error: discord key not set", http.StatusInternalServerError)
		log.Println("Error getting discord key:", err)
		return
	}

	// Exchange the code for an access token.
	tokenURL := "https://discord.com/api/oauth2/token"
	form := url.Values{}
	form.Set("client_id", reqData.ClientID)
	form.Set("client_secret", clientSecret)
	form.Set("grant_type", "authorization_code")
	form.Set("code", reqData.Code)
	form.Set("redirect_uri", reqData.RedirectURI)
	form.Set("scope", "identify")

	log.Printf("Exchanging code for token. URL: %s, Form: %s\n", tokenURL, form.Encode())

	authHeader := base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%s:%s", reqData.ClientID, clientSecret)))
	tokenReq, err := http.NewRequest("POST", tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		http.Error(w, "Failed to create token exchange request", http.StatusInternalServerError)
		log.Println("Error creating token exchange request:", err)
		return
	}
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	tokenReq.Header.Set("Authorization", "Basic "+authHeader)

	// Set a timeout to avoid hanging indefinitely.
	client := &http.Client{
		Timeout: 15 * time.Second,
	}
	log.Println("Sending token exchange request to Discord")
	tokenResp, err := client.Do(tokenReq)
	if err != nil {
		http.Error(w, "Failed to exchange code for token", http.StatusInternalServerError)
		log.Println("Error during token exchange request:", err)
		return
	}
	defer tokenResp.Body.Close()
	log.Printf("Token exchange response status: %d\n", tokenResp.StatusCode)

	if tokenResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(tokenResp.Body)
		http.Error(w, fmt.Sprintf("Discord token exchange error: %s", body), http.StatusInternalServerError)
		log.Printf("Discord token exchange returned status %d: %s\n", tokenResp.StatusCode, string(body))
		return
	}

	var tokenData map[string]interface{}
	if err := json.NewDecoder(tokenResp.Body).Decode(&tokenData); err != nil {
		http.Error(w, "Failed to parse token response", http.StatusInternalServerError)
		log.Println("Error parsing token response:", err)
		return
	}
	log.Printf("Token data received: %+v\n", tokenData)

	accessToken, ok := tokenData["access_token"].(string)
	if !ok || accessToken == "" {
		http.Error(w, "Access token not found in Discord response", http.StatusInternalServerError)
		log.Println("Access token missing in token data")
		return
	}
	log.Println("Access token acquired")

	// Fetch user information using the access token.
	userReq, err := http.NewRequest("GET", "https://discord.com/api/users/@me", nil)
	if err != nil {
		http.Error(w, "Failed to create user info request", http.StatusInternalServerError)
		log.Println("Error creating user info request:", err)
		return
	}
	userReq.Header.Set("Authorization", "Bearer "+accessToken)

	log.Println("Sending user info request to Discord")
	userResp, err := client.Do(userReq)
	if err != nil {
		http.Error(w, "Failed to fetch user info", http.StatusInternalServerError)
		log.Println("Error during user info request:", err)
		return
	}
	defer userResp.Body.Close()
	log.Printf("User info response status: %d\n", userResp.StatusCode)

	if userResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(userResp.Body)
		http.Error(w, fmt.Sprintf("Discord user info error: %s", body), http.StatusInternalServerError)
		log.Printf("Discord user info request returned status %d: %s\n", userResp.StatusCode, string(body))
		return
	}

	var userInfo map[string]interface{}
	if err := json.NewDecoder(userResp.Body).Decode(&userInfo); err != nil {
		http.Error(w, "Failed to parse user info", http.StatusInternalServerError)
		log.Println("Error parsing user info:", err)
		return
	}
	log.Printf("User info received: %+v\n", userInfo)

	// Create a JWT token with the user details.
	now := time.Now()
	expiration := now.Add(30 * 24 * time.Hour) // 30 days
	claims := jwt.MapClaims{
		"userId":        userInfo["id"],
		"username":      userInfo["username"],
		"discriminator": userInfo["discriminator"],
		"iat":           now.Unix(),
		"exp":           expiration.Unix(),
	}
	jwtToken := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signedToken, err := jwtToken.SignedString([]byte(clientSecret))
	if err != nil {
		http.Error(w, "Failed to sign JWT", http.StatusInternalServerError)
		log.Println("Error signing JWT:", err)
		return
	}
	log.Println("JWT token successfully created")

	// Prepare and write the JSON response.
	responseData := map[string]interface{}{
		"token": signedToken,
		"user":  userInfo,
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(responseData); err != nil {
		http.Error(w, "Failed to write JSON response", http.StatusInternalServerError)
		log.Println("Error writing JSON response:", err)
		return
	}
	log.Printf("Successfully processed Discord OAuth request in %v\n", time.Since(startTime))
}

// ValidateJWT takes in a JWT token string and returns the userId from its claims if the token is valid.
// It uses the embedded Discord secret (from keys/discord.txt) to verify the token.
func ValidateJWT(tokenStr string) (string, error) {
	clientSecret, err := config.GetDiscordKey()
	if err != nil {
		return "", fmt.Errorf("failed to get discord key: %w", err)
	}

	// Parse the token with a key function that validates the signing method.
	parsedToken, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
		// Check that the signing method is HMAC (HS256)
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(clientSecret), nil
	})
	if err != nil {
		log.Printf("Error parsing JWT token: %v\n", err)
		return "", err
	}
	if !parsedToken.Valid {
		log.Println("Invalid JWT token")
		return "", fmt.Errorf("invalid token")
	}

	// Extract claims.
	claims, ok := parsedToken.Claims.(jwt.MapClaims)
	if !ok {
		log.Println("JWT token claims are not of type MapClaims")
		return "", fmt.Errorf("invalid token claims")
	}

	// Retrieve the userId from claims.
	userID, ok := claims["userId"].(string)
	if !ok || userID == "" {
		log.Println("userId not found in JWT claims")
		return "", fmt.Errorf("userId not found in token claims")
	}

	return userID, nil
}
