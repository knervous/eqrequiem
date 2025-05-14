import * as $ from "capnp-es";


export const copyCapn = <T extends $.Struct>(obj: T) : T => {
  const newObj = {} as T;
    
  return newObj;
};

