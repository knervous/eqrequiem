
export interface Transform {
    x: number;
    y: number;
    z: number;
    rotateX: number;
    rotateY: number;
    rotateZ: number;
    scale: number;
  }
  
  interface Light {
    x: number;
    y: number;
    z: number;
    radius: number;
    r: number;
    g: number;
    b: number;
  }
  
  interface ZoneLineInfo {
    type?: number;
    index?: number;
    rot?: number;
    x?: number;
    y?: number;
    z?: number;
    zoneIndex?: number;
  }
  
  interface Region {
    minVertex: [number, number, number];
    maxVertex: [number, number, number];
    center: [number, number, number];
    regionType: number;
    zoneLineInfo: ZoneLineInfo | null;
  }
  
export interface ZoneMetadata {
    version: number;
    objects: {
      [key: string]: Transform[];
    };
    lights: Light[];
    sounds: any[];
    regions: Region[];
  }