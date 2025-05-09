
type Constructor<T> = new (...args: any[]) => T;

declare module "godot" {
    interface Vector3 {
      subtract(other: Vector3): Vector3;
      add(other: Vector3): Vector3;
      addNoMutate(other: Vector3): Vector3;
      multiplyScalar(scalar: number): Vector3;
      xform(other: Vector3): Vector3;
      set(x: number, y: number, z: number): Vector3;
      normalized(): Vector3;
      negated(): Vector3;
    }
    interface Transform3D {
      xform(other: Vector3): Vector3;
      affine_inverse(): Transform3D;
    }
    interface Basis {
      xform(other: Vector3): Vector3;
    }

    interface GDictionary {
        toObject(): any;
    }

    interface StandardMaterial3D {
        eqShader: number;
        eqFile: string;
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
      getJsBytes(name: string, innerFile: string): Promise<Uint8Array | null>?;
      setSplash(value: boolean): void?;
    }
  }
declare const window: Window;

export {};