(module
 (type $0 (func (param i32 i32)))
 (type $1 (func (result i32)))
 (type $2 (func (param i32)))
 (type $3 (func (param i32) (result i32)))
 (type $4 (func (param i32 i32) (result i32)))
 (type $5 (func))
 (type $6 (func (param i32 i32 i32 i32)))
 (type $7 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)))
 (type $8 (func (param i32 i32 i32 f32 f32 f32 f32)))
 (type $9 (func (param i32 f32 f32 f32)))
 (type $10 (func (param i32 f32)))
 (import "env" "abort" (func $~lib/builtins/abort (param i32 i32 i32 i32)))
 (global $assembly/zone-simulation/MAX_ENTITIES i32 (i32.const 16384))
 (global $assembly/zone-simulation/ARENA_BYTES i32 (i32.const 2359360))
 (global $~lib/shared/runtime/Runtime.Stub i32 (i32.const 0))
 (global $~lib/shared/runtime/Runtime.Minimal i32 (i32.const 1))
 (global $~lib/shared/runtime/Runtime.Incremental i32 (i32.const 2))
 (global $~lib/rt/stub/startOffset (mut i32) (i32.const 0))
 (global $~lib/rt/stub/offset (mut i32) (i32.const 0))
 (global $~lib/native/ASC_RUNTIME i32 (i32.const 0))
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
 (global $~lib/memory/__heap_base i32 (i32.const 252))
 (memory $0 1)
 (data $0 (i32.const 12) ",\00\00\00\00\00\00\00\00\00\00\00\02\00\00\00\1c\00\00\00I\00n\00v\00a\00l\00i\00d\00 \00l\00e\00n\00g\00t\00h\00")
 (data $1 (i32.const 60) "<\00\00\00\00\00\00\00\00\00\00\00\02\00\00\00&\00\00\00~\00l\00i\00b\00/\00s\00t\00a\00t\00i\00c\00a\00r\00r\00a\00y\00.\00t\00s\00\00\00\00\00\00\00")
 (data $2 (i32.const 124) "<\00\00\00\00\00\00\00\00\00\00\00\02\00\00\00(\00\00\00A\00l\00l\00o\00c\00a\00t\00i\00o\00n\00 \00t\00o\00o\00 \00l\00a\00r\00g\00e\00\00\00\00\00")
 (data $3 (i32.const 188) "<\00\00\00\00\00\00\00\00\00\00\00\02\00\00\00\1e\00\00\00~\00l\00i\00b\00/\00r\00t\00/\00s\00t\00u\00b\00.\00t\00s\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00")
 (table $0 1 1 funcref)
 (elem $0 (i32.const 1))
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
 (func $~lib/rt/stub/maybeGrowMemory (param $newOffset i32)
  (local $pagesBefore i32)
  (local $maxOffset i32)
  (local $pagesNeeded i32)
  (local $4 i32)
  (local $5 i32)
  (local $pagesWanted i32)
  memory.size
  local.set $pagesBefore
  local.get $pagesBefore
  i32.const 16
  i32.shl
  i32.const 15
  i32.add
  i32.const 15
  i32.const -1
  i32.xor
  i32.and
  local.set $maxOffset
  local.get $newOffset
  local.get $maxOffset
  i32.gt_u
  if
   local.get $newOffset
   local.get $maxOffset
   i32.sub
   i32.const 65535
   i32.add
   i32.const 65535
   i32.const -1
   i32.xor
   i32.and
   i32.const 16
   i32.shr_u
   local.set $pagesNeeded
   local.get $pagesBefore
   local.tee $4
   local.get $pagesNeeded
   local.tee $5
   local.get $4
   local.get $5
   i32.gt_s
   select
   local.set $pagesWanted
   local.get $pagesWanted
   memory.grow
   i32.const 0
   i32.lt_s
   if
    local.get $pagesNeeded
    memory.grow
    i32.const 0
    i32.lt_s
    if
     unreachable
    end
   end
  end
  local.get $newOffset
  global.set $~lib/rt/stub/offset
 )
 (func $~lib/rt/common/BLOCK#set:mmInfo (param $this i32) (param $mmInfo i32)
  local.get $this
  local.get $mmInfo
  i32.store
 )
 (func $~lib/rt/stub/__alloc (param $size i32) (result i32)
  (local $block i32)
  (local $ptr i32)
  (local $size|3 i32)
  (local $payloadSize i32)
  local.get $size
  i32.const 1073741820
  i32.gt_u
  if
   i32.const 144
   i32.const 208
   i32.const 33
   i32.const 29
   call $~lib/builtins/abort
   unreachable
  end
  global.get $~lib/rt/stub/offset
  local.set $block
  global.get $~lib/rt/stub/offset
  i32.const 4
  i32.add
  local.set $ptr
  block $~lib/rt/stub/computeSize|inlined.0 (result i32)
   local.get $size
   local.set $size|3
   local.get $size|3
   i32.const 4
   i32.add
   i32.const 15
   i32.add
   i32.const 15
   i32.const -1
   i32.xor
   i32.and
   i32.const 4
   i32.sub
   br $~lib/rt/stub/computeSize|inlined.0
  end
  local.set $payloadSize
  local.get $ptr
  local.get $payloadSize
  i32.add
  call $~lib/rt/stub/maybeGrowMemory
  local.get $block
  local.get $payloadSize
  call $~lib/rt/common/BLOCK#set:mmInfo
  local.get $ptr
  return
 )
 (func $~lib/rt/common/OBJECT#set:gcInfo (param $this i32) (param $gcInfo i32)
  local.get $this
  local.get $gcInfo
  i32.store offset=4
 )
 (func $~lib/rt/common/OBJECT#set:gcInfo2 (param $this i32) (param $gcInfo2 i32)
  local.get $this
  local.get $gcInfo2
  i32.store offset=8
 )
 (func $~lib/rt/common/OBJECT#set:rtId (param $this i32) (param $rtId i32)
  local.get $this
  local.get $rtId
  i32.store offset=12
 )
 (func $~lib/rt/common/OBJECT#set:rtSize (param $this i32) (param $rtSize i32)
  local.get $this
  local.get $rtSize
  i32.store offset=16
 )
 (func $~lib/rt/stub/__new (param $size i32) (param $id i32) (result i32)
  (local $ptr i32)
  (local $object i32)
  local.get $size
  i32.const 1073741804
  i32.gt_u
  if
   i32.const 144
   i32.const 208
   i32.const 86
   i32.const 30
   call $~lib/builtins/abort
   unreachable
  end
  i32.const 16
  local.get $size
  i32.add
  call $~lib/rt/stub/__alloc
  local.set $ptr
  local.get $ptr
  i32.const 4
  i32.sub
  local.set $object
  local.get $object
  i32.const 0
  call $~lib/rt/common/OBJECT#set:gcInfo
  local.get $object
  i32.const 0
  call $~lib/rt/common/OBJECT#set:gcInfo2
  local.get $object
  local.get $id
  call $~lib/rt/common/OBJECT#set:rtId
  local.get $object
  local.get $size
  call $~lib/rt/common/OBJECT#set:rtSize
  local.get $ptr
  i32.const 16
  i32.add
  return
 )
 (func $~lib/staticarray/StaticArray<u8>#constructor (param $this i32) (param $length i32) (result i32)
  (local $outSize i32)
  (local $out i32)
  local.get $length
  i32.const 1073741820
  i32.const 0
  i32.shr_u
  i32.gt_u
  if
   i32.const 32
   i32.const 80
   i32.const 51
   i32.const 60
   call $~lib/builtins/abort
   unreachable
  end
  local.get $length
  i32.const 0
  i32.shl
  local.set $outSize
  local.get $outSize
  i32.const 4
  call $~lib/rt/stub/__new
  local.set $out
  i32.const 0
  global.get $~lib/shared/runtime/Runtime.Incremental
  i32.ne
  drop
  local.get $out
  i32.const 0
  local.get $outSize
  memory.fill
  local.get $out
  return
 )
 (func $start:assembly/zone-simulation
  global.get $~lib/memory/__heap_base
  i32.const 4
  i32.add
  i32.const 15
  i32.add
  i32.const 15
  i32.const -1
  i32.xor
  i32.and
  i32.const 4
  i32.sub
  global.set $~lib/rt/stub/startOffset
  global.get $~lib/rt/stub/startOffset
  global.set $~lib/rt/stub/offset
  i32.const 0
  global.get $assembly/zone-simulation/ARENA_BYTES
  call $~lib/staticarray/StaticArray<u8>#constructor
  global.set $assembly/zone-simulation/arena
 )
 (func $assembly/zone-simulation/capacity (result i32)
  global.get $assembly/zone-simulation/MAX_ENTITIES
  return
 )
 (func $assembly/zone-simulation/arenaPtr (result i32)
  global.get $assembly/zone-simulation/arena
  return
 )
 (func $assembly/zone-simulation/arenaByteLength (result i32)
  global.get $assembly/zone-simulation/ARENA_BYTES
  return
 )
 (func $assembly/zone-simulation/bindEntityArena (param $idsPtr i32) (param $kindsPtr i32) (param $positionXPtr i32) (param $positionYPtr i32) (param $positionZPtr i32) (param $velocityXPtr i32) (param $velocityYPtr i32) (param $velocityZPtr i32) (param $animationPtr i32) (param $movementStatePtr i32) (param $targetXPtr i32) (param $targetYPtr i32) (param $targetZPtr i32) (param $speedPtr i32) (param $dirtyFlagsPtr i32) (param $dirtyIndicesPtr i32)
  local.get $idsPtr
  global.set $assembly/zone-simulation/ids
  local.get $kindsPtr
  global.set $assembly/zone-simulation/kinds
  local.get $positionXPtr
  global.set $assembly/zone-simulation/positionX
  local.get $positionYPtr
  global.set $assembly/zone-simulation/positionY
  local.get $positionZPtr
  global.set $assembly/zone-simulation/positionZ
  local.get $velocityXPtr
  global.set $assembly/zone-simulation/velocityX
  local.get $velocityYPtr
  global.set $assembly/zone-simulation/velocityY
  local.get $velocityZPtr
  global.set $assembly/zone-simulation/velocityZ
  local.get $animationPtr
  global.set $assembly/zone-simulation/animation
  local.get $movementStatePtr
  global.set $assembly/zone-simulation/movementState
  local.get $targetXPtr
  global.set $assembly/zone-simulation/targetX
  local.get $targetYPtr
  global.set $assembly/zone-simulation/targetY
  local.get $targetZPtr
  global.set $assembly/zone-simulation/targetZ
  local.get $speedPtr
  global.set $assembly/zone-simulation/speed
  local.get $dirtyFlagsPtr
  global.set $assembly/zone-simulation/dirtyFlags
  local.get $dirtyIndicesPtr
  global.set $assembly/zone-simulation/dirtyIndices
 )
 (func $assembly/zone-simulation/markDirty (param $index i32)
  local.get $index
  i32.const 0
  i32.ge_s
  if (result i32)
   local.get $index
   global.get $assembly/zone-simulation/MAX_ENTITIES
   i32.lt_s
  else
   i32.const 0
  end
  if
   global.get $assembly/zone-simulation/dirtyFlags
   local.get $index
   i32.add
   i32.const 1
   i32.store8
  end
 )
 (func $assembly/zone-simulation/spawnEntity (param $index i32) (param $id i32) (param $kind i32) (param $x f32) (param $y f32) (param $z f32) (param $moveSpeed f32)
  (local $scalarOffset i32)
  (local $vectorOffset i32)
  local.get $index
  i32.const 0
  i32.lt_s
  if (result i32)
   i32.const 1
  else
   local.get $index
   global.get $assembly/zone-simulation/MAX_ENTITIES
   i32.ge_s
  end
  if
   return
  end
  local.get $index
  i32.const 2
  i32.shl
  local.set $scalarOffset
  local.get $index
  i32.const 12
  i32.mul
  local.set $vectorOffset
  global.get $assembly/zone-simulation/ids
  local.get $index
  i32.const 2
  i32.shl
  i32.add
  local.get $id
  i32.store
  global.get $assembly/zone-simulation/kinds
  local.get $index
  i32.add
  local.get $kind
  i32.store8
  global.get $assembly/zone-simulation/positionX
  local.get $vectorOffset
  i32.add
  local.get $x
  f32.store
  global.get $assembly/zone-simulation/positionY
  local.get $vectorOffset
  i32.add
  local.get $y
  f32.store
  global.get $assembly/zone-simulation/positionZ
  local.get $vectorOffset
  i32.add
  local.get $z
  f32.store
  global.get $assembly/zone-simulation/targetX
  local.get $scalarOffset
  i32.add
  local.get $x
  f32.store
  global.get $assembly/zone-simulation/targetY
  local.get $scalarOffset
  i32.add
  local.get $y
  f32.store
  global.get $assembly/zone-simulation/targetZ
  local.get $scalarOffset
  i32.add
  local.get $z
  f32.store
  global.get $assembly/zone-simulation/speed
  local.get $scalarOffset
  i32.add
  local.get $moveSpeed
  f32.store
  global.get $assembly/zone-simulation/animation
  local.get $scalarOffset
  i32.add
  i32.const 0
  i32.store
  global.get $assembly/zone-simulation/movementState
  local.get $index
  i32.const 1
  i32.shl
  i32.add
  i32.const 0
  i32.store16
  local.get $index
  call $assembly/zone-simulation/markDirty
 )
 (func $assembly/zone-simulation/setEntityTarget (param $index i32) (param $x f32) (param $y f32) (param $z f32)
  local.get $index
  i32.const 0
  i32.lt_s
  if (result i32)
   i32.const 1
  else
   local.get $index
   global.get $assembly/zone-simulation/MAX_ENTITIES
   i32.ge_s
  end
  if
   return
  end
  global.get $assembly/zone-simulation/targetX
  local.get $index
  i32.const 2
  i32.shl
  i32.add
  local.get $x
  f32.store
  global.get $assembly/zone-simulation/targetY
  local.get $index
  i32.const 2
  i32.shl
  i32.add
  local.get $y
  f32.store
  global.get $assembly/zone-simulation/targetZ
  local.get $index
  i32.const 2
  i32.shl
  i32.add
  local.get $z
  f32.store
 )
 (func $assembly/zone-simulation/tickNpcs (param $entityCount i32) (param $deltaMs f32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $count i32)
  (local $dt f32)
  (local $i i32)
  (local $scalarOffset i32)
  (local $vectorOffset i32)
  (local $dx f32)
  (local $dy f32)
  (local $dz f32)
  (local $distanceSq f32)
  (local $wasMoving i32)
  (local $x f32)
  (local $inverseDistance f32)
  (local $moveSpeed f32)
  (local $step f32)
  local.get $entityCount
  local.tee $2
  i32.const 0
  local.tee $3
  local.get $2
  local.get $3
  i32.gt_s
  select
  local.tee $4
  global.get $assembly/zone-simulation/MAX_ENTITIES
  local.tee $5
  local.get $4
  local.get $5
  i32.lt_s
  select
  local.set $count
  local.get $deltaMs
  f32.const 1.0000000474974513e-03
  f32.mul
  local.set $dt
  i32.const 0
  local.set $i
  loop $for-loop|0
   local.get $i
   local.get $count
   i32.lt_s
   if
    block $for-continue|0
     global.get $assembly/zone-simulation/kinds
     local.get $i
     i32.add
     i32.load8_u
     i32.const 2
     i32.ne
     if
      br $for-continue|0
     end
     local.get $i
     i32.const 2
     i32.shl
     local.set $scalarOffset
     local.get $i
     i32.const 12
     i32.mul
     local.set $vectorOffset
     global.get $assembly/zone-simulation/targetX
     local.get $scalarOffset
     i32.add
     f32.load
     global.get $assembly/zone-simulation/positionX
     local.get $vectorOffset
     i32.add
     f32.load
     f32.sub
     local.set $dx
     global.get $assembly/zone-simulation/targetY
     local.get $scalarOffset
     i32.add
     f32.load
     global.get $assembly/zone-simulation/positionY
     local.get $vectorOffset
     i32.add
     f32.load
     f32.sub
     local.set $dy
     global.get $assembly/zone-simulation/targetZ
     local.get $scalarOffset
     i32.add
     f32.load
     global.get $assembly/zone-simulation/positionZ
     local.get $vectorOffset
     i32.add
     f32.load
     f32.sub
     local.set $dz
     local.get $dx
     local.get $dx
     f32.mul
     local.get $dy
     local.get $dy
     f32.mul
     f32.add
     local.get $dz
     local.get $dz
     f32.mul
     f32.add
     local.set $distanceSq
     local.get $distanceSq
     f32.const 9.999999747378752e-05
     f32.lt
     if
      global.get $assembly/zone-simulation/movementState
      local.get $i
      i32.const 1
      i32.shl
      i32.add
      i32.load16_u
      i32.const 0
      i32.ne
      local.set $wasMoving
      global.get $assembly/zone-simulation/velocityX
      local.get $vectorOffset
      i32.add
      f32.const 0
      f32.store
      global.get $assembly/zone-simulation/velocityY
      local.get $vectorOffset
      i32.add
      f32.const 0
      f32.store
      global.get $assembly/zone-simulation/velocityZ
      local.get $vectorOffset
      i32.add
      f32.const 0
      f32.store
      global.get $assembly/zone-simulation/animation
      local.get $scalarOffset
      i32.add
      i32.const 0
      i32.store
      global.get $assembly/zone-simulation/movementState
      local.get $i
      i32.const 1
      i32.shl
      i32.add
      i32.const 0
      i32.store16
      local.get $wasMoving
      if
       local.get $i
       call $assembly/zone-simulation/markDirty
      end
      br $for-continue|0
     end
     f32.const 1
     block $~lib/math/NativeMathf.sqrt|inlined.0 (result f32)
      local.get $distanceSq
      local.set $x
      local.get $x
      f32.sqrt
      br $~lib/math/NativeMathf.sqrt|inlined.0
     end
     f32.div
     local.set $inverseDistance
     global.get $assembly/zone-simulation/speed
     local.get $scalarOffset
     i32.add
     f32.load
     local.set $moveSpeed
     local.get $moveSpeed
     local.get $dt
     f32.mul
     f32.const 1
     local.get $inverseDistance
     f32.div
     f32.min
     local.set $step
     global.get $assembly/zone-simulation/velocityX
     local.get $vectorOffset
     i32.add
     local.get $dx
     local.get $inverseDistance
     f32.mul
     local.get $moveSpeed
     f32.mul
     f32.store
     global.get $assembly/zone-simulation/velocityY
     local.get $vectorOffset
     i32.add
     local.get $dy
     local.get $inverseDistance
     f32.mul
     local.get $moveSpeed
     f32.mul
     f32.store
     global.get $assembly/zone-simulation/velocityZ
     local.get $vectorOffset
     i32.add
     local.get $dz
     local.get $inverseDistance
     f32.mul
     local.get $moveSpeed
     f32.mul
     f32.store
     global.get $assembly/zone-simulation/positionX
     local.get $vectorOffset
     i32.add
     global.get $assembly/zone-simulation/positionX
     local.get $vectorOffset
     i32.add
     f32.load
     local.get $dx
     local.get $inverseDistance
     f32.mul
     local.get $step
     f32.mul
     f32.add
     f32.store
     global.get $assembly/zone-simulation/positionY
     local.get $vectorOffset
     i32.add
     global.get $assembly/zone-simulation/positionY
     local.get $vectorOffset
     i32.add
     f32.load
     local.get $dy
     local.get $inverseDistance
     f32.mul
     local.get $step
     f32.mul
     f32.add
     f32.store
     global.get $assembly/zone-simulation/positionZ
     local.get $vectorOffset
     i32.add
     global.get $assembly/zone-simulation/positionZ
     local.get $vectorOffset
     i32.add
     f32.load
     local.get $dz
     local.get $inverseDistance
     f32.mul
     local.get $step
     f32.mul
     f32.add
     f32.store
     global.get $assembly/zone-simulation/animation
     local.get $scalarOffset
     i32.add
     i32.const 1
     i32.store
     global.get $assembly/zone-simulation/movementState
     local.get $i
     i32.const 1
     i32.shl
     i32.add
     i32.const 1
     i32.store16
     local.get $i
     call $assembly/zone-simulation/markDirty
    end
    local.get $i
    i32.const 1
    i32.add
    local.set $i
    br $for-loop|0
   end
  end
 )
 (func $assembly/zone-simulation/collectDirty (param $entityCount i32) (result i32)
  (local $1 i32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $count i32)
  (local $i i32)
  i32.const 0
  global.set $assembly/zone-simulation/dirtyCount
  local.get $entityCount
  local.tee $1
  i32.const 0
  local.tee $2
  local.get $1
  local.get $2
  i32.gt_s
  select
  local.tee $3
  global.get $assembly/zone-simulation/MAX_ENTITIES
  local.tee $4
  local.get $3
  local.get $4
  i32.lt_s
  select
  local.set $count
  i32.const 0
  local.set $i
  loop $for-loop|0
   local.get $i
   local.get $count
   i32.lt_s
   if
    block $for-continue|0
     global.get $assembly/zone-simulation/dirtyFlags
     local.get $i
     i32.add
     i32.load8_u
     i32.const 0
     i32.eq
     if
      br $for-continue|0
     end
     global.get $assembly/zone-simulation/dirtyIndices
     global.get $assembly/zone-simulation/dirtyCount
     i32.const 2
     i32.shl
     i32.add
     local.get $i
     i32.store
     global.get $assembly/zone-simulation/dirtyFlags
     local.get $i
     i32.add
     i32.const 0
     i32.store8
     global.get $assembly/zone-simulation/dirtyCount
     i32.const 1
     i32.add
     global.set $assembly/zone-simulation/dirtyCount
    end
    local.get $i
    i32.const 1
    i32.add
    local.set $i
    br $for-loop|0
   end
  end
  global.get $assembly/zone-simulation/dirtyCount
  return
 )
 (func $~start
  call $start:assembly/zone-simulation
 )
)
