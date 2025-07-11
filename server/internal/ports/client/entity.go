package client

const (
	EntityTypeNPC = iota
	EntityTypePlayer
	EntityTypeCorpse
)

type MobPosition struct {
	X, Y, Z float64
	Heading float64
}

type Velocity struct {
	X float64
	Y float64
	Z float64
}

type EntityDataSource interface {
	Level() uint8
	Class() uint8
}

type Entity interface {
	ID() int
	GetMob() *Mob
	Name() string
	Type() int32
	Say(msg string)
	Position() MobPosition
	SetPosition(pos MobPosition)
}
