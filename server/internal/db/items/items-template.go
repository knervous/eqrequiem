package items

import (
	"bytes"
	"encoding/binary"
	"errors"
	"log"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/session"

	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
)

func ConvertItemTemplateToCapnp(ses *session.Session, item *model.Items) eq.Items {
	i, err := eq.NewItems(ses.RootSeg)
	if err != nil {
		log.Printf("error creating new Items capnp object: %v", err)
		return eq.Items{}
	}
	i.SetId(item.ID)
	i.SetName(item.Name)

	return i
}

func CreateItemInstanceFromTemplateID(id int32) ItemInstance {
	item, err := GetItemTemplateByID(id)
	if err != nil {
		panic(err)
	}

	return ItemInstance{
		ItemID:    item.ID,
		Mods:      Mods{},
		Charges:   0,
		Quantity:  0,
		OwnerID:   nil,
		OwnerType: OwnerTypeCharacter,
		Item:      item,
	}
}

// GetItemByID retrieves an item by its ItemsBinary.ID
func GetItemTemplateByID(id int32) (model.Items, error) {
	index, exists := instance.idToIndex[id]
	if !exists {
		return model.Items{}, errors.New("item ID not found")
	}

	if index < 0 || index*instance.recordSize >= int32(len(instance.data)) {
		return model.Items{}, errors.New("index out of bounds")
	}

	var binaryItem ItemsBinary
	buf := bytes.NewReader(instance.data[index*instance.recordSize : (index+1)*instance.recordSize])
	err := binary.Read(buf, binary.LittleEndian, &binaryItem)
	if err != nil {
		return model.Items{}, err
	}

	return binaryItem.ToItems(), nil
}
