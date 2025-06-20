package zone

import (
	db_chardata "github.com/knervous/eqgo/internal/db/character"
	"github.com/knervous/eqgo/internal/session"
)

func savePlayerData(ses *session.Session) error {
	if ses.Client == nil || ses.Client.CharData == nil {
		return nil // No client data to save
	}

	charData := ses.Client.CharData
	if err := db_chardata.UpdateCharacter(charData, ses.AccountID); err != nil {
		return err
	}

	return nil
}
