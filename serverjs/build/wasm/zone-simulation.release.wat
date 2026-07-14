(module
 (type $0 (func (result i32)))
 (type $1 (func (param i32)))
 (type $2 (func))
 (type $3 (func (param i32 f32)))
 (type $4 (func (param i32 i32 i32 f32 f32 f32 f32)))
 (type $5 (func (param i32 f32 f32 f32)))
 (type $6 (func (param i32) (result i32)))
 (type $7 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)))
 (global $assembly/zone-simulation/arena (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/ids (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/kinds (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/positionX (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/positionY (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/positionZ (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/velocityX (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/velocityY (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/velocityZ (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/targetX (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/targetY (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/targetZ (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/speed (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/animation (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/movementState (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/dirtyFlags (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/dirtyIndices (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/dirtyCount (mut i32) (i32.const 0))
 (memory $0 1)
 (data $0 (i32.const 1036) ",")
 (data $0.1 (i32.const 1048) "\02\00\00\00\1c\00\00\00I\00n\00v\00a\00l\00i\00d\00 \00l\00e\00n\00g\00t\00h")
 (data $1 (i32.const 1084) "<")
 (data $1.1 (i32.const 1096) "\02\00\00\00&\00\00\00~\00l\00i\00b\00/\00s\00t\00a\00t\00i\00c\00a\00r\00r\00a\00y\00.\00t\00s")
 (data $2 (i32.const 1148) "<")
 (data $2.1 (i32.const 1160) "\02\00\00\00(\00\00\00A\00l\00l\00o\00c\00a\00t\00i\00o\00n\00 \00t\00o\00o\00 \00l\00a\00r\00g\00e")
 (data $3 (i32.const 1212) "<")
 (data $3.1 (i32.const 1224) "\02\00\00\00\1e\00\00\00~\00l\00i\00b\00/\00r\00t\00/\00s\00t\00u\00b\00.\00t\00s")
 (export "capacity" (func $assembly/zone-simulation/capacity))
 (export "arenaPtr" (func $assembly/zone-simulation/arenaPtr))
 (export "arenaByteLength" (func $assembly/zone-simulation/arenaByteLength))
 (export "bindEntityArena" (func $assembly/zone-simulation/bindEntityArena))
 (export "spawnEntity" (func $assembly/zone-simulation/spawnEntity))
 (export "setEntityTarget" (func $assembly/zone-simulation/setEntityTarget))
 (export "markDirty" (func $assembly/zone-simulation/markDirty))
 (export "tickNpcs" (func $assembly/zone-simulation/tickNpcs))
 (export "collectDirty" (func $assembly/zone-simulation/collectDirty))
 (export "memory" (memory $0))
 (start $~start)
 (func $assembly/zone-simulation/markDirty (param $0 i32)
  local.get $0
  i32.const 16384
  i32.lt_s
  local.get $0
  i32.const 0
  i32.ge_s
  i32.and
  if
   global.get $assembly/zone-simulation/dirtyFlags
   local.get $0
   i32.add
   i32.const 1
   i32.store8
  end
 )
 (func $~start
  (local $0 i32)
  (local $1 i32)
  memory.size
  local.tee $0
  i32.const 16
  i32.shl
  i32.const 15
  i32.add
  i32.const -16
  i32.and
  local.tee $1
  i32.const 2360668
  i32.lt_u
  if
   local.get $0
   i32.const 2426203
   local.get $1
   i32.sub
   i32.const -65536
   i32.and
   i32.const 16
   i32.shr_u
   local.tee $1
   local.get $0
   local.get $1
   i32.gt_s
   select
   memory.grow
   i32.const 0
   i32.lt_s
   if
    local.get $1
    memory.grow
    i32.const 0
    i32.lt_s
    if
     unreachable
    end
   end
  end
  i32.const 1276
  i32.const 2359388
  i32.store
  i32.const 1280
  i32.const 0
  i32.store
  i32.const 1284
  i32.const 0
  i32.store
  i32.const 1288
  i32.const 4
  i32.store
  i32.const 1292
  i32.const 2359360
  i32.store
  i32.const 1296
  i32.const 0
  i32.const 2359360
  memory.fill
  i32.const 1296
  global.set $assembly/zone-simulation/arena
 )
 (func $assembly/zone-simulation/tickNpcs (param $0 i32) (param $1 f32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 f32)
  (local $6 f32)
  (local $7 i32)
  (local $8 f32)
  (local $9 f32)
  (local $10 f32)
  (local $11 i32)
  (local $12 f32)
  i32.const 16384
  local.get $0
  i32.const 0
  local.get $0
  i32.const 0
  i32.gt_s
  select
  local.tee $0
  local.get $0
  i32.const 16384
  i32.ge_s
  select
  local.set $0
  local.get $1
  f32.const 1.0000000474974513e-03
  f32.mul
  local.set $1
  loop $for-loop|0
   local.get $0
   local.get $2
   i32.gt_s
   if
    block $for-continue|0
     global.get $assembly/zone-simulation/kinds
     local.get $2
     i32.add
     i32.load8_u
     i32.const 2
     i32.ne
     br_if $for-continue|0
     local.get $2
     i32.const 2
     i32.shl
     local.tee $7
     global.get $assembly/zone-simulation/targetX
     i32.add
     f32.load
     local.get $2
     i32.const 12
     i32.mul
     local.tee $3
     global.get $assembly/zone-simulation/positionX
     i32.add
     f32.load
     f32.sub
     local.tee $8
     local.get $8
     f32.mul
     global.get $assembly/zone-simulation/targetY
     local.get $7
     i32.add
     f32.load
     global.get $assembly/zone-simulation/positionY
     local.get $3
     i32.add
     f32.load
     f32.sub
     local.tee $9
     local.get $9
     f32.mul
     f32.add
     global.get $assembly/zone-simulation/targetZ
     local.get $7
     i32.add
     f32.load
     global.get $assembly/zone-simulation/positionZ
     local.get $3
     i32.add
     f32.load
     f32.sub
     local.tee $10
     local.get $10
     f32.mul
     f32.add
     local.tee $6
     f32.const 9.999999747378752e-05
     f32.lt
     if
      global.get $assembly/zone-simulation/movementState
      local.get $2
      i32.const 1
      i32.shl
      i32.add
      local.tee $4
      i32.load16_u
      i32.const 0
      i32.ne
      global.get $assembly/zone-simulation/velocityX
      local.get $3
      i32.add
      f32.const 0
      f32.store
      global.get $assembly/zone-simulation/velocityY
      local.get $3
      i32.add
      f32.const 0
      f32.store
      global.get $assembly/zone-simulation/velocityZ
      local.get $3
      i32.add
      f32.const 0
      f32.store
      global.get $assembly/zone-simulation/animation
      local.get $7
      i32.add
      i32.const 0
      i32.store
      local.get $4
      i32.const 0
      i32.store16
      if
       local.get $2
       call $assembly/zone-simulation/markDirty
      end
      br $for-continue|0
     end
     global.get $assembly/zone-simulation/speed
     local.get $7
     i32.add
     f32.load
     local.tee $5
     local.get $1
     f32.mul
     f32.const 1
     f32.const 1
     local.get $6
     f32.sqrt
     f32.div
     local.tee $6
     f32.div
     f32.min
     local.set $12
     global.get $assembly/zone-simulation/velocityX
     local.get $3
     i32.add
     local.get $8
     local.get $6
     f32.mul
     local.tee $8
     local.get $5
     f32.mul
     f32.store
     global.get $assembly/zone-simulation/velocityY
     local.get $3
     i32.add
     local.get $9
     local.get $6
     f32.mul
     local.tee $9
     local.get $5
     f32.mul
     f32.store
     global.get $assembly/zone-simulation/velocityZ
     local.get $3
     i32.add
     local.get $10
     local.get $6
     f32.mul
     local.tee $6
     local.get $5
     f32.mul
     f32.store
     global.get $assembly/zone-simulation/positionX
     local.get $3
     i32.add
     local.tee $4
     local.get $4
     f32.load
     local.get $8
     local.get $12
     f32.mul
     f32.add
     f32.store
     global.get $assembly/zone-simulation/positionY
     local.get $3
     i32.add
     local.tee $4
     local.get $4
     f32.load
     local.get $9
     local.get $12
     f32.mul
     f32.add
     f32.store
     global.get $assembly/zone-simulation/positionZ
     local.get $3
     i32.add
     local.tee $3
     local.get $3
     f32.load
     local.get $6
     local.get $12
     f32.mul
     f32.add
     f32.store
     global.get $assembly/zone-simulation/animation
     local.get $7
     i32.add
     i32.const 1
     i32.store
     global.get $assembly/zone-simulation/movementState
     local.get $2
     i32.const 1
     i32.shl
     i32.add
     i32.const 1
     i32.store16
     local.get $2
     call $assembly/zone-simulation/markDirty
    end
    local.get $2
    i32.const 1
    i32.add
    local.set $2
    br $for-loop|0
   end
  end
 )
 (func $assembly/zone-simulation/spawnEntity (param $0 i32) (param $1 i32) (param $2 i32) (param $3 f32) (param $4 f32) (param $5 f32) (param $6 f32)
  (local $7 i32)
  local.get $0
  i32.const 0
  i32.lt_s
  local.get $0
  i32.const 16384
  i32.ge_s
  i32.or
  if
   return
  end
  local.get $0
  i32.const 2
  i32.shl
  local.tee $7
  global.get $assembly/zone-simulation/ids
  i32.add
  local.get $1
  i32.store
  global.get $assembly/zone-simulation/kinds
  local.get $0
  i32.add
  local.get $2
  i32.store8
  local.get $0
  i32.const 12
  i32.mul
  local.tee $1
  global.get $assembly/zone-simulation/positionX
  i32.add
  local.get $3
  f32.store
  global.get $assembly/zone-simulation/positionY
  local.get $1
  i32.add
  local.get $4
  f32.store
  global.get $assembly/zone-simulation/positionZ
  local.get $1
  i32.add
  local.get $5
  f32.store
  local.get $7
  global.get $assembly/zone-simulation/targetX
  i32.add
  local.get $3
  f32.store
  global.get $assembly/zone-simulation/targetY
  local.get $7
  i32.add
  local.get $4
  f32.store
  global.get $assembly/zone-simulation/targetZ
  local.get $7
  i32.add
  local.get $5
  f32.store
  global.get $assembly/zone-simulation/speed
  local.get $7
  i32.add
  local.get $6
  f32.store
  global.get $assembly/zone-simulation/animation
  local.get $7
  i32.add
  i32.const 0
  i32.store
  global.get $assembly/zone-simulation/movementState
  local.get $0
  i32.const 1
  i32.shl
  i32.add
  i32.const 0
  i32.store16
  local.get $0
  call $assembly/zone-simulation/markDirty
 )
 (func $assembly/zone-simulation/setEntityTarget (param $0 i32) (param $1 f32) (param $2 f32) (param $3 f32)
  local.get $0
  i32.const 0
  i32.lt_s
  local.get $0
  i32.const 16384
  i32.ge_s
  i32.or
  if
   return
  end
  local.get $0
  i32.const 2
  i32.shl
  local.tee $0
  global.get $assembly/zone-simulation/targetX
  i32.add
  local.get $1
  f32.store
  local.get $0
  global.get $assembly/zone-simulation/targetY
  i32.add
  local.get $2
  f32.store
  local.get $0
  global.get $assembly/zone-simulation/targetZ
  i32.add
  local.get $3
  f32.store
 )
 (func $assembly/zone-simulation/collectDirty (param $0 i32) (result i32)
  (local $1 i32)
  (local $2 i32)
  i32.const 0
  global.set $assembly/zone-simulation/dirtyCount
  i32.const 16384
  local.get $0
  i32.const 0
  local.get $0
  i32.const 0
  i32.gt_s
  select
  local.tee $0
  local.get $0
  i32.const 16384
  i32.ge_s
  select
  local.set $1
  i32.const 0
  local.set $0
  loop $for-loop|0
   local.get $0
   local.get $1
   i32.lt_s
   if
    global.get $assembly/zone-simulation/dirtyFlags
    local.get $0
    i32.add
    local.tee $2
    i32.load8_u
    if
     global.get $assembly/zone-simulation/dirtyIndices
     global.get $assembly/zone-simulation/dirtyCount
     i32.const 2
     i32.shl
     i32.add
     local.get $0
     i32.store
     local.get $2
     i32.const 0
     i32.store8
     global.get $assembly/zone-simulation/dirtyCount
     i32.const 1
     i32.add
     global.set $assembly/zone-simulation/dirtyCount
    end
    local.get $0
    i32.const 1
    i32.add
    local.set $0
    br $for-loop|0
   end
  end
  global.get $assembly/zone-simulation/dirtyCount
 )
 (func $assembly/zone-simulation/capacity (result i32)
  i32.const 16384
 )
 (func $assembly/zone-simulation/bindEntityArena (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 i32) (param $5 i32) (param $6 i32) (param $7 i32) (param $8 i32) (param $9 i32) (param $10 i32) (param $11 i32) (param $12 i32) (param $13 i32) (param $14 i32) (param $15 i32)
  local.get $0
  global.set $assembly/zone-simulation/ids
  local.get $1
  global.set $assembly/zone-simulation/kinds
  local.get $2
  global.set $assembly/zone-simulation/positionX
  local.get $3
  global.set $assembly/zone-simulation/positionY
  local.get $4
  global.set $assembly/zone-simulation/positionZ
  local.get $5
  global.set $assembly/zone-simulation/velocityX
  local.get $6
  global.set $assembly/zone-simulation/velocityY
  local.get $7
  global.set $assembly/zone-simulation/velocityZ
  local.get $8
  global.set $assembly/zone-simulation/animation
  local.get $9
  global.set $assembly/zone-simulation/movementState
  local.get $10
  global.set $assembly/zone-simulation/targetX
  local.get $11
  global.set $assembly/zone-simulation/targetY
  local.get $12
  global.set $assembly/zone-simulation/targetZ
  local.get $13
  global.set $assembly/zone-simulation/speed
  local.get $14
  global.set $assembly/zone-simulation/dirtyFlags
  local.get $15
  global.set $assembly/zone-simulation/dirtyIndices
 )
 (func $assembly/zone-simulation/arenaPtr (result i32)
  global.get $assembly/zone-simulation/arena
 )
 (func $assembly/zone-simulation/arenaByteLength (result i32)
  i32.const 2359360
 )
)
