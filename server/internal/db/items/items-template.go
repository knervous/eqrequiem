package items

import (
	"bytes"
	"encoding/binary"
	"errors"
	eqpb "knervous/eqgo/internal/api/proto"
	"log"
	"time"

	"github.com/jinzhu/copier"

	"knervous/eqgo/internal/db/jetgen/eqgo/model"
)

func ConvertItemTemplateToPb(item *model.Items) *eqpb.Items {
	pb := &eqpb.Items{}

	if err := copier.Copy(pb, item); err != nil {
		log.Printf("warning: copier.Copy failed: %v", err)
	}
	pb.Id = item.ID
	if item.Updated != nil {
		pb.Updated = item.Updated.Format(time.RFC3339)
	}

	return pb
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
