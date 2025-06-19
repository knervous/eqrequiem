package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math"

	_ "github.com/go-sql-driver/mysql"
	"github.com/knervous/eqgo/internal/config"
)

const (
	angleThrDeg = 15.0 // only keep points with > 15° bend
	distThr     = 5.0  // prune if two segments are this short
	minSegment  = 5.0  // drop segments shorter than this
	epsilon     = 0.01 // distance epsilon for deduplication
)

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
func main() {
	dbConf, err := config.Get()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}
	if dbConf.DBHost == "" || dbConf.DBUser == "" || dbConf.DBPass == "" {
		log.Fatal("database connection details are not set in config")
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?parseTime=true",
		dbConf.DBUser,
		dbConf.DBPass,
		dbConf.DBHost,
		dbConf.DBPort,
		"eqgo",
	)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("failed to connect to DB: %v", err)
	}
	defer db.Close()

	createTable := `
CREATE TABLE IF NOT EXISTS grid_paths (
  zoneid INT NOT NULL,
  gridid INT NOT NULL,
  points JSON NOT NULL,
  PRIMARY KEY (zoneid, gridid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`
	if _, err := db.Exec(createTable); err != nil {
		log.Fatalf("failed to create grid_paths table: %v", err)
	}

	// Step 1 (optional): aggregate from grid_entries
	// aggregatePaths(db)

	// Step 2: prune existing paths
	// prunePaths(db)

	// Step 3: transform paths
	if err := transformPaths(db); err != nil {
		log.Fatalf("failed to transform paths: %v", err)
	}
	log.Println("Grid path pruning complete.")
}

// ─────────────────────────────────────────────────────────────────────────────
// AGGREGATE
// ─────────────────────────────────────────────────────────────────────────────
func aggregatePaths(db *sql.DB) {
	rows, err := db.Query(`
SELECT zoneid, gridid, x, y, z, heading, pause
FROM grid_entries
ORDER BY zoneid, gridid, number
`)
	if err != nil {
		log.Fatalf("failed to query grid_entries: %v", err)
	}
	defer rows.Close()

	type key struct{ zoneid, gridid int }
	paths := make(map[key][][]float64)

	for rows.Next() {
		var zid, gid int
		var x, y, z, heading, pause float64
		if err := rows.Scan(&zid, &gid, &x, &y, &z, &heading, &pause); err != nil {
			log.Printf("scan error: %v", err)
			continue
		}
		k := key{zid, gid}
		paths[k] = append(paths[k], []float64{x, y, z, heading, pause})
	}
	if err := rows.Err(); err != nil {
		log.Fatalf("row iteration error: %v", err)
	}

	stmt, err := db.Prepare(`
INSERT INTO grid_paths (zoneid, gridid, points)
VALUES (?, ?, ?)
ON DUPLICATE KEY UPDATE points = VALUES(points)
`)
	if err != nil {
		log.Fatalf("failed to prepare insert statement: %v", err)
	}
	defer stmt.Close()

	for k, pts := range paths {
		jsonData, err := json.Marshal(pts)
		if err != nil {
			log.Printf("marshal error for %v: %v", k, err)
			continue
		}
		if _, err := stmt.Exec(k.zoneid, k.gridid, jsonData); err != nil {
			log.Printf("insert error for %v: %v", k, err)
		} else {
			log.Printf("aggregated %v (%d points)", k, len(pts))
		}
	}
}

func transformPaths(db *sql.DB) error {
	rows, err := db.Query(`SELECT zoneid, gridid, points FROM grid_paths`)
	if err != nil {
		return fmt.Errorf("query grid_paths: %v", err)
	}
	defer rows.Close()

	upd, err := db.Prepare(`UPDATE grid_paths SET points = ? WHERE zoneid = ? AND gridid = ?`)
	if err != nil {
		return fmt.Errorf("prepare update: %v", err)
	}
	defer upd.Close()

	for rows.Next() {
		var zoneid, gridid int
		var raw json.RawMessage
		if err := rows.Scan(&zoneid, &gridid, &raw); err != nil {
			log.Printf("scan error: %v", err)
			continue
		}

		// unmarshal to [][]float64
		var pts [][]float64
		if err := json.Unmarshal(raw, &pts); err != nil {
			log.Printf("unmarshal %d:%d: %v", zoneid, gridid, err)
			continue
		}

		// apply transform to each point
		for i, p := range pts {
			if len(p) < 5 {
				log.Printf("unexpected point length %d in %d:%d, skipping", len(p), zoneid, gridid)
				continue
			}
			// unpack old values
			_, _, _, heading, pause := p[0], p[1], p[2], p[3], p[4]

			// rotation: newX = -y, newY = z, newZ = x
			// pts[i][0] = -y
			// pts[i][1] = z
			// pts[i][2] = x

			// convert heading from [0..512) units → radians
			pts[i][3] = heading * (2 * math.Pi / 512.0)

			// preserve pause
			pts[i][4] = pause

		}

		// re-marshal and update
		newJSON, err := json.Marshal(pts)
		if err != nil {
			log.Printf("remarshal %d:%d: %v", zoneid, gridid, err)
			continue
		}
		if _, err := upd.Exec(newJSON, zoneid, gridid); err != nil {
			log.Printf("update %d:%d: %v", zoneid, gridid, err)
		} else {
			log.Printf("transformed %d:%d (%d points)", zoneid, gridid, len(pts))
		}
	}
	return rows.Err()
}

// ─────────────────────────────────────────────────────────────────────────────
// PRUNE PIPELINE
// ─────────────────────────────────────────────────────────────────────────────
func prunePaths(db *sql.DB) {
	rows, err := db.Query(`SELECT zoneid, gridid, points FROM grid_paths`)
	if err != nil {
		log.Fatalf("failed to query grid_paths: %v", err)
	}
	defer rows.Close()

	updateStmt, err := db.Prepare(`UPDATE grid_paths SET points = ? WHERE zoneid = ? AND gridid = ?`)
	if err != nil {
		log.Fatalf("failed to prepare update statement: %v", err)
	}
	defer updateStmt.Close()

	angleCosThr := math.Cos(angleThrDeg * math.Pi / 180.0)
	distSq := distThr * distThr
	minSegSq := minSegment * minSegment

	for rows.Next() {
		var zid, gid int
		var raw json.RawMessage
		if err := rows.Scan(&zid, &gid, &raw); err != nil {
			log.Printf("scan error on grid_paths: %v", err)
			continue
		}

		var pts [][]float64
		if err := json.Unmarshal(raw, &pts); err != nil {
			log.Printf("unmarshal error for %d-%d: %v", zid, gid, err)
			continue
		}

		// Deduplicate first
		pts = removeExactDuplicates(pts, epsilon)

		// Prune aggressively
		pruned := pruneSliceAggressive(pts, angleCosThr, distSq, minSegSq)

		if len(pruned) < len(pts) {
			data, err := json.Marshal(pruned)
			if err != nil {
				log.Printf("marshal pruned for %d-%d: %v", zid, gid, err)
				continue
			}
			if _, err := updateStmt.Exec(data, zid, gid); err != nil {
				log.Printf("update pruned for %d-%d: %v", zid, gid, err)
			} else {
				log.Printf("pruned %d-%d: %d -> %d points", zid, gid, len(pts), len(pruned))
			}
		}
	}
	if err := rows.Err(); err != nil {
		log.Fatalf("row iteration error: %v", err)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
func pruneSliceAggressive(pts [][]float64, angleCosThr, distSq, minSegSq float64) [][]float64 {
	if len(pts) < 3 {
		return pts
	}

	out := make([][]float64, 0, len(pts))
	out = append(out, pts[0]) // keep first

	for i := 1; i < len(pts)-1; i++ {
		prev, curr, next := pts[i-1], pts[i], pts[i+1]

		// vectors
		dx1, dy1, dz1 := curr[0]-prev[0], curr[1]-prev[1], curr[2]-prev[2]
		dx2, dy2, dz2 := next[0]-curr[0], next[1]-curr[1], next[2]-curr[2]

		len1Sq := dx1*dx1 + dy1*dy1 + dz1*dz1
		len2Sq := dx2*dx2 + dy2*dy2 + dz2*dz2

		// prune jitter
		if len1Sq < distSq && len2Sq < distSq {
			continue
		}
		if len1Sq < minSegSq && len2Sq < minSegSq {
			continue
		}

		// angle
		dot := dx1*dx2 + dy1*dy2 + dz1*dz2
		len1 := math.Sqrt(len1Sq)
		len2 := math.Sqrt(len2Sq)
		if len1 == 0 || len2 == 0 {
			continue
		}
		cosTheta := dot / (len1 * len2)

		if cosTheta < angleCosThr {
			out = append(out, curr)
		}
	}

	out = append(out, pts[len(pts)-1]) // always keep last
	return out
}

func removeExactDuplicates(pts [][]float64, epsilon float64) [][]float64 {
	if len(pts) == 0 {
		return pts
	}
	out := [][]float64{pts[0]}
	for i := 1; i < len(pts); i++ {
		if !nearEqualVec3(pts[i], pts[i-1], epsilon) {
			out = append(out, pts[i])
		}
	}
	return out
}

func nearEqualVec3(a, b []float64, eps float64) bool {
	dx := a[0] - b[0]
	dy := a[1] - b[1]
	dz := a[2] - b[2]
	return dx*dx+dy*dy+dz*dz < eps*eps
}
