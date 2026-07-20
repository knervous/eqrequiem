export type ShadoPublishedScalar = string | number | boolean | null;

export type ShadoPublishedOption<T extends ShadoPublishedScalar = ShadoPublishedScalar> =
  | T
  | {
      value: T;
      label?: string;
      description?: string;
    };

export type ShadoPublishConfig<T extends ShadoPublishedScalar = ShadoPublishedScalar> = {
  /** Friendly public name. Defaults to the decorated property name. */
  name?: string;
  label?: string;
  description?: string;
  group?: string;
  /** Optional semantic attachment point, for example `r_point`. */
  socket?: string;
  values?: readonly ShadoPublishedOption<T>[];
  readonly?: boolean;
  fromInternal?: (value: unknown, owner: object) => T;
  toInternal?: (value: T, owner: object) => unknown;
};

export type ShadoPublishedProperty = {
  name: string;
  property: string;
  label: string;
  description?: string;
  group?: string;
  socket?: string;
  readonly: boolean;
  values?: readonly Readonly<{
    value: ShadoPublishedScalar;
    label: string;
    description?: string;
  }>[];
};

type RegisteredPublishedProperty = ShadoPublishedProperty & {
  fromInternal?: ShadoPublishConfig['fromInternal'];
  toInternal?: ShadoPublishConfig['toInternal'];
};

const PUBLISHED_PROPERTIES = Symbol('shado:published-properties');

function titleCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/^./, first => first.toUpperCase());
}

function normalizeOption(option: ShadoPublishedOption): NonNullable<ShadoPublishedProperty['values']>[number] {
  if (typeof option === 'object' && option !== null && 'value' in option) {
    return Object.freeze({
      value: option.value,
      label: option.label ?? titleCase(String(option.value)),
      description: option.description,
    });
  }
  return Object.freeze({ value: option, label: titleCase(String(option)) });
}

function registerPublishedProperty(ctor: any, property: string, config: ShadoPublishConfig<any>): void {
  const inherited = (ctor[PUBLISHED_PROPERTIES] ?? []) as RegisteredPublishedProperty[];
  const own: RegisteredPublishedProperty[] = Object.prototype.hasOwnProperty.call(ctor, PUBLISHED_PROPERTIES)
    ? inherited
    : [...inherited];
  const name = config.name ?? property;
  const descriptor: RegisteredPublishedProperty = Object.freeze({
    name,
    property,
    label: config.label ?? titleCase(name),
    description: config.description,
    group: config.group,
    socket: config.socket,
    readonly: config.readonly ?? false,
    values: config.values ? Object.freeze(config.values.map(normalizeOption)) : undefined,
    fromInternal: config.fromInternal,
    toInternal: config.toInternal,
  });
  const existing = own.findIndex(entry => entry.name === name || entry.property === property);
  if (existing >= 0) own[existing] = descriptor;
  else own.push(descriptor);
  Object.defineProperty(ctor, PUBLISHED_PROPERTIES, {
    value: own,
    configurable: true,
  });
}

/**
 * Publishes an internally managed property through `instance.published`.
 *
 * Enum-like `values` automatically map a friendly value to the field's numeric
 * index, so `actor.published.armor = 'plate'` can safely drive an internal f32.
 */
export function shadoPublish<const T extends ShadoPublishedScalar = ShadoPublishedScalar>(
  config: ShadoPublishConfig<T> = {}
) {
  return function (...args: any[]): void {
    // SWC's legacy transform supplies an unused third descriptor argument.
    args = args.filter(argument => argument !== undefined && argument !== null);
    if (args.length === 2 && (typeof args[1] === 'string' || typeof args[1] === 'symbol')) {
      registerPublishedProperty(args[0].constructor, String(args[1]), config);
      return;
    }
    if (args.length === 2 && typeof args[1] === 'object' && 'kind' in args[1]) {
      const context = args[1];
      const property = String(context.name);
      context.addInitializer(function (this: any) {
        registerPublishedProperty(this.constructor, property, config);
      });
    }
  };
}

export function getShadoPublishedProperties(ownerOrCtor: object | Function): readonly ShadoPublishedProperty[] {
  const ctor = typeof ownerOrCtor === 'function' ? ownerOrCtor : ownerOrCtor.constructor;
  const entries = ((ctor as any)[PUBLISHED_PROPERTIES] ?? []) as RegisteredPublishedProperty[];
  return entries.map(({ fromInternal: _from, toInternal: _to, ...descriptor }) => descriptor);
}

function registered(owner: object, name: string): RegisteredPublishedProperty {
  const entries = ((owner.constructor as any)[PUBLISHED_PROPERTIES] ?? []) as RegisteredPublishedProperty[];
  const descriptor = entries.find(entry => entry.name === name);
  if (!descriptor) {
    throw new RangeError(`Unknown published Shado property "${name}".`);
  }
  return descriptor;
}

function publicValue(owner: any, descriptor: RegisteredPublishedProperty): ShadoPublishedScalar {
  const internal = owner[descriptor.property];
  if (descriptor.fromInternal) return descriptor.fromInternal(internal, owner);
  if (descriptor.values && typeof internal === 'number') {
    return descriptor.values[Math.max(0, Math.min(descriptor.values.length - 1, Math.round(internal)))]?.value ?? null;
  }
  return internal as ShadoPublishedScalar;
}

function setPublicValue(owner: any, descriptor: RegisteredPublishedProperty, value: ShadoPublishedScalar): void {
  if (descriptor.readonly) throw new TypeError(`Published Shado property "${descriptor.name}" is read-only.`);
  let internal: unknown = value;
  if (descriptor.toInternal) {
    internal = descriptor.toInternal(value, owner);
  } else if (descriptor.values) {
    const index = descriptor.values.findIndex(option =>
      option.value === value ||
      (typeof value === 'string' && option.label.toLowerCase() === value.toLowerCase())
    );
    if (index < 0) {
      const allowed = descriptor.values.map(option => JSON.stringify(option.value)).join(', ');
      throw new RangeError(`Invalid value for "${descriptor.name}": ${String(value)}. Expected one of ${allowed}.`);
    }
    internal = index;
  }
  owner[descriptor.property] = internal;
}

export type ShadoPublishedFacade = Record<string, unknown> & {
  $get(name: string): ShadoPublishedScalar;
  $set(name: string, value: ShadoPublishedScalar): void;
  $describe(): readonly ShadoPublishedProperty[];
  toJSON(): Record<string, ShadoPublishedScalar>;
};

export function createShadoPublishedFacade(owner: object): ShadoPublishedFacade {
  const api = {
    $get(name: string) {
      return publicValue(owner, registered(owner, name));
    },
    $set(name: string, value: ShadoPublishedScalar) {
      setPublicValue(owner, registered(owner, name), value);
    },
    $describe() {
      return getShadoPublishedProperties(owner);
    },
    toJSON() {
      return Object.fromEntries(
        getShadoPublishedProperties(owner).map(descriptor => [descriptor.name, publicValue(owner, registered(owner, descriptor.name))])
      );
    },
  };
  return new Proxy(api as ShadoPublishedFacade, {
    get(target, property, receiver) {
      if (typeof property !== 'string' || property in target) return Reflect.get(target, property, receiver);
      return api.$get(property);
    },
    set(target, property, value, receiver) {
      if (typeof property !== 'string' || property in target) return Reflect.set(target, property, value, receiver);
      api.$set(property, value as ShadoPublishedScalar);
      return true;
    },
    ownKeys(target) {
      return [...Reflect.ownKeys(target), ...getShadoPublishedProperties(owner).map(entry => entry.name)];
    },
    getOwnPropertyDescriptor(target, property) {
      return Reflect.getOwnPropertyDescriptor(target, property) ??
        (typeof property === 'string' && getShadoPublishedProperties(owner).some(entry => entry.name === property)
          ? { enumerable: true, configurable: true }
          : undefined);
    },
  });
}
