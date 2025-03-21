import { Callable, ItemList, Node, OptionButton } from "godot";
import ZoneManager from "../Zone/zone-manager";


export const pcModels = [
    'bam',
    'baf',
    'erm',
    'erf',
    'elf',
    'elm',
    'gnf',
    'gnm',
    'trf',
    'trm',
    'hum',
    'huf',
    'daf',
    'dam',
    'dwf',
    'dwm',
    'haf',
    'ikf',
    'ikm',
    'ham',
    'hif',
    'him',
    'hof',
    'hom',
    'ogm',
    'ogf',
    'kef',
    'kem',
    // Robes
    'daf01',
    'dam01',
    'erf01',
    'erm01',
    'gnf01',
    'gnm01',
    'hif01',
    'him01',
    'huf01',
    'hum01',
    'ikf01',
    'ikm01',
  ];
  
export default class DebugUI extends Node { 
    _ready(): void {
        console.log('Debug UI Ready');
        const raceList = this.get_node("RaceChooser") as OptionButton;
        for (const model of pcModels) {
            raceList.add_item(model);
        }
        const zone = this.get_node('/root/Zone') as ZoneManager;
        raceList.connect('item_selected', Callable.create(this, item => {
            console.log("Selected item", item)
          
            zone.instantiatePlayer(pcModels[item]);
        }));
    }

}