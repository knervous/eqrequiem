package main

import (
	"database/sql"
	"fmt"
	"log"
	"sort"
	"strings"

	"github.com/go-jet/jet/v2/generator/mysql"
	_ "github.com/go-sql-driver/mysql"
	"github.com/knervous/eqgo/internal/config"
)

func getConnection() (mysql.DBConnection, error) {
	serverConfig, err := config.Get()
	if err != nil {
		return mysql.DBConnection{}, fmt.Errorf("failed to read config: %v", err)
	}
	if serverConfig.DBHost == "" || serverConfig.DBUser == "" || serverConfig.DBPass == "" {
		return mysql.DBConnection{}, fmt.Errorf("database connection details are not set")
	}
	return mysql.DBConnection{
		Host:     serverConfig.DBHost,
		Port:     serverConfig.DBPort,
		User:     serverConfig.DBUser,
		Password: serverConfig.DBPass,
		DBName:   "eqgo",
		Params:   "parseTime=true",
	}, nil
}

func buildDSN(c mysql.DBConnection) string {
	return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?%s",
		c.User, c.Password, c.Host, c.Port, c.DBName, c.Params)
}

// generateSafeUpdate returns the SQL for flipping one prefix on table.
func generateSafeUpdate(table, prefix string) string {
	// determine column names
	var cx, cy, cz string
	if prefix == "" {
		cx, cy, cz = "x", "y", "z"
	} else {
		cx = prefix + "_x"
		cy = prefix + "_y"
		cz = prefix + "_z"
	}

	return fmt.Sprintf(`-- %s: transform (%s,%s,%s)
UPDATE %s AS s
INNER JOIN (
  SELECT id, %s AS oldx, %s AS oldy, %s AS oldz
  FROM %s
) AS t ON s.id = t.id
SET
  s.%s = -t.oldy,
  s.%s =  t.oldz,
  s.%s =  t.oldx;
`, table, cx, cy, cz, table, cx, cy, cz, table, cx, cy, cz)
}

func listAndGenerate(db *sql.DB, schema string) error {
	// 1) find all x/y/z‐style columns
	const q = `
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = ?
      AND column_name REGEXP '^(.*_)?[xyz]$'
    `
	rows, err := db.Query(q, schema)
	if err != nil {
		return err
	}
	defer rows.Close()

	tblCols := map[string][]string{}
	for rows.Next() {
		var tbl, col string
		if err := rows.Scan(&tbl, &col); err != nil {
			return err
		}
		tblCols[tbl] = append(tblCols[tbl], col)
	}

	// 2) for each table, detect full prefixes
	tables := make([]string, 0, len(tblCols))
	for t := range tblCols {
		tables = append(tables, t)
	}
	sort.Strings(tables)

	for _, tbl := range tables {
		// group dims by prefix
		coordSets := map[string]map[string]bool{}
		for _, c := range tblCols[tbl] {
			var prefix, dim string
			if c == "x" || c == "y" || c == "z" {
				prefix, dim = "", c
			} else if idx := strings.LastIndex(c, "_"); idx != -1 {
				prefix = c[:idx]
				dim = c[idx+1:]
			}
			if dim == "x" || dim == "y" || dim == "z" {
				if coordSets[prefix] == nil {
					coordSets[prefix] = make(map[string]bool)
				}
				coordSets[prefix][dim] = true
			}
		}

		// find full triples
		for prefix, dims := range coordSets {
			if dims["x"] && dims["y"] && dims["z"] {
				// emit the SQL
				fmt.Print(generateSafeUpdate(tbl, prefix))
			}
		}
	}

	return nil
}

func main() {
	conn, err := getConnection()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}
	dsn := buildDSN(conn)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("db open: %v", err)
	}
	defer db.Close()

	if err := listAndGenerate(db, conn.DBName); err != nil {
		log.Fatalf("failed: %v", err)
	}
}
