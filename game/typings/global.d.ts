
type Constructor<T> = new (...args: any[]) => T;

declare module "godot" {
    interface Vector3 {
      subtract(other: Vector3): Vector3;
      add(other: Vector3): Vector3;
      multiplyScalar(scalar: number): Vector3;
      set(x: number, y: number, z: number): void;
      normalized(): Vector3;
    }

    interface GDictionary {
        toObject(): any;
    }

    interface StandardMaterial3D {
        eqShader: number;
    }
    
    interface Texture2D {
        flip_y: boolean;
    }

    interface PackedStringArray {
        toArray(): string[];
    }

    interface Node {
        getNodesOfType <T>(type: Constructor<T>): T[];
    }
  }

  declare global {
    interface Window {
      getJsBytes(name: string): Promise<Uint8Array | null>?;
      setSplash(value: boolean): void?;
    }
  }
  declare const window: Window;

  export {}