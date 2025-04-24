package main

import (
	"fmt"
	"knervous/eqgo/internal/config"
	"log"

	"github.com/go-jet/jet/v2/generator/mysql"
)

func getConnection() (mysql.DBConnection, error) {
	serverConfig, err := config.NewConfig()
	if err != nil {
		return mysql.DBConnection{}, fmt.Errorf("failed to read config: %v", err)
	}

	host := serverConfig.GetString("db_host", "")
	port := serverConfig.GetInt("db_port", 3306)
	user := serverConfig.GetString("db_user", "")
	pass := serverConfig.GetString("db_pass", "")

	if host == "" || user == "" || pass == "" {
		return mysql.DBConnection{}, fmt.Errorf("database connection details are not set")
	}

	return mysql.DBConnection{
		Host:     host,
		Port:     port,
		User:     user,
		Password: pass,
		Params:   "parseTime=true",
		DBName:   "peq",
	}, nil
}

func main() {
	dbConn, err := getConnection()
	if err != nil {
		log.Fatalf("failed to get connection details: %v", err)
	}

	err = mysql.Generate("./internal/db/jetgen", dbConn)
	if err != nil {
		log.Fatalf("failed to generate Jet bindings: %v", err)
	}

	log.Println("Jet bindings generated successfully in ./internal/db/jetgen")
}
