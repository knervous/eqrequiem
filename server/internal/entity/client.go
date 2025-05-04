package entity

type Client struct {
	Mob
	ConnectionID string
}

func (c *Client) Type() string { return "client" }
