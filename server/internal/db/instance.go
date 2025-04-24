package db

import (
	"database/sql"
	"fmt"
)

type WorldDB struct {
	DB *sql.DB
}

var GlobalWorldDB *WorldDB

func InitWorldDB(dsn string) error {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return fmt.Errorf("failed to ping database: %w", err)
	}

	fmt.Println("Connected to database successfully")
	GlobalWorldDB = &WorldDB{DB: db}
	return nil
}
