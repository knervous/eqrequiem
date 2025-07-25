// Code generated by 'yaegi extract github.com/knervous/eqgo/internal/entity'. DO NOT EDIT.

package yaegi_wrappers

import (
	"reflect"

	entity "github.com/knervous/eqgo/internal/zone/interface"
	"github.com/knervous/eqgo/internal/zone/npc"
)

func init() {
	Symbols["github.com/knervous/eqgo/internal/entity/entity"] = map[string]reflect.Value{
		// type definitions
		"Client":  reflect.ValueOf((*entity.Client)(nil)),
		"Mob":     reflect.ValueOf((*entity.Mob)(nil)),
		"Entity": reflect.ValueOf((*entity.Entity)(nil)),
		"NPC":     reflect.ValueOf((*npc.NPC)(nil)),

		// interface wrapper definitions
		"_Moblike": reflect.ValueOf((*_github_com_knervous_eqgo_internal_entity_Moblike)(nil)),
	}
}

// _github_com_knervous_eqgo_internal_entity_Moblike is an interface wrapper for Entity type
type _github_com_knervous_eqgo_internal_entity_Moblike struct {
	IValue interface{}
	WID    func() int
	WName  func() string
	WType  func() string
}

func (W _github_com_knervous_eqgo_internal_entity_Moblike) ID() int {
	return W.WID()
}
func (W _github_com_knervous_eqgo_internal_entity_Moblike) Name() string {
	return W.WName()
}
func (W _github_com_knervous_eqgo_internal_entity_Moblike) Type() string {
	return W.WType()
}
