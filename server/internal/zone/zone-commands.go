package zone

import (
	"context"
	"strconv"
	"sync"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	db_character "github.com/knervous/eqgo/internal/db/character"

	"github.com/knervous/eqgo/internal/api/opcodes"
	"github.com/knervous/eqgo/internal/session"
)

var (
	commandRegistry = map[string]func(*ZoneInstance, *session.Session, []string){
		"level":  commandLevel,
		"gearup": commandGearup,
	}
	commandRegistryMutex = &sync.Mutex{}
)

func AddCommandHandler(command string, handler func(*ZoneInstance, *session.Session, []string)) {
	commandRegistryMutex.Lock()
	defer commandRegistryMutex.Unlock()
	commandRegistry[command] = handler
}

func (z *ZoneInstance) HandleCommand(session *session.Session, command string, args []string) {
	commandRegistryMutex.Lock()
	defer commandRegistryMutex.Unlock()

	if handler, exists := commandRegistry[command]; exists {
		handler(z, session, args)
	}
}

func commandGearup(z *ZoneInstance, ses *session.Session, args []string) {
	db_character.PurgeCharacterEquipment(context.Background(), int32(ses.Client.CharData().ID))

	db_character.GearUp(ses.Client)
	db_character.UpdateCharacterItems(context.Background(), ses.Client)
}

func commandLevel(z *ZoneInstance, ses *session.Session, args []string) {
	if len(args) < 1 {
		return
	}
	level := args[0]
	if level == "" {
		return
	}
	levelInt, err := strconv.Atoi(level)
	if err != nil || levelInt < 1 || levelInt > 50 {
		return
	}

	charData := ses.Client.CharData()
	charData.Level = uint32(levelInt)
	ses.Client.UpdateStats()

	// Send level
	Datagram(
		ses,
		eq.NewRootLevelUpdate,
		opcodes.LevelUpdate,
		func(m eq.LevelUpdate) error {
			m.SetLevel(int32(levelInt))
			m.SetExp(0)
			return nil
		},
	)
}
