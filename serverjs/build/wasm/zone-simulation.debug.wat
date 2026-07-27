(module
 (type $0 (func (param i32 i32)))
 (type $1 (func (result i32)))
 (type $2 (func (param f32) (result f32)))
 (type $3 (func (param i32)))
 (type $4 (func (param i32) (result i32)))
 (type $5 (func (param i32 i32) (result i32)))
 (type $6 (func))
 (type $7 (func (param i32 i32 i32 i32)))
 (type $8 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)))
 (type $9 (func (param i32 i32 i32 f32 f32 f32 f32)))
 (type $10 (func (param i32 f32 f32 f32)))
 (type $11 (func (param f32 f32) (result f32)))
 (type $12 (func (param i32 f32)))
 (import "env" "abort" (func $~lib/builtins/abort (param i32 i32 i32 i32)))
 (global $assembly/zone-simulation/MAX_ENTITIES i32 (i32.const 16384))
 (global $assembly/zone-simulation/ARENA_BYTES i32 (i32.const 2621504))
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
 (global $assembly/zone-simulation/orientationX (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/orientationY (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/orientationZ (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/orientationW (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/velocityX (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/velocityY (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/velocityZ (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/targetX (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/targetY (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/targetZ (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/speed (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/animation (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/movementState (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/heading (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/dirtyFlags (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/dirtyIndices (mut i32) (i32.const 0))
 (global $assembly/zone-simulation/dirtyCount (mut i32) (i32.const 0))
 (global $~lib/native/ASC_SHRINK_LEVEL i32 (i32.const 0))
 (global $~lib/math/rempio2f_y (mut f64) (f64.const 0))
 (global $~lib/memory/__heap_base i32 (i32.const 288))
 (memory $0 1)
 (data $0 (i32.const 12) ",\00\00\00\00\00\00\00\00\00\00\00\02\00\00\00\1c\00\00\00I\00n\00v\00a\00l\00i\00d\00 \00l\00e\00n\00g\00t\00h\00")
 (data $1 (i32.const 60) "<\00\00\00\00\00\00\00\00\00\00\00\02\00\00\00&\00\00\00~\00l\00i\00b\00/\00s\00t\00a\00t\00i\00c\00a\00r\00r\00a\00y\00.\00t\00s\00\00\00\00\00\00\00")
 (data $2 (i32.const 124) "<\00\00\00\00\00\00\00\00\00\00\00\02\00\00\00(\00\00\00A\00l\00l\00o\00c\00a\00t\00i\00o\00n\00 \00t\00o\00o\00 \00l\00a\00r\00g\00e\00\00\00\00\00")
 (data $3 (i32.const 188) "<\00\00\00\00\00\00\00\00\00\00\00\02\00\00\00\1e\00\00\00~\00l\00i\00b\00/\00r\00t\00/\00s\00t\00u\00b\00.\00t\00s\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00")
 (data $4 (i32.const 256) ")\15DNn\83\f9\a2\c0\dd4\f5\d1W\'\fcA\90C<\99\95b\dba\c5\bb\de\abcQ\fe")
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
 (func $assembly/zone-simulation/bindEntityArena (param $idsPtr i32) (param $kindsPtr i32) (param $positionXPtr i32) (param $positionYPtr i32) (param $positionZPtr i32) (param $orientationXPtr i32) (param $orientationYPtr i32) (param $orientationZPtr i32) (param $orientationWPtr i32) (param $velocityXPtr i32) (param $velocityYPtr i32) (param $velocityZPtr i32) (param $animationPtr i32) (param $movementStatePtr i32) (param $headingPtr i32) (param $targetXPtr i32) (param $targetYPtr i32) (param $targetZPtr i32) (param $speedPtr i32) (param $dirtyFlagsPtr i32) (param $dirtyIndicesPtr i32)
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
  local.get $orientationXPtr
  global.set $assembly/zone-simulation/orientationX
  local.get $orientationYPtr
  global.set $assembly/zone-simulation/orientationY
  local.get $orientationZPtr
  global.set $assembly/zone-simulation/orientationZ
  local.get $orientationWPtr
  global.set $assembly/zone-simulation/orientationW
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
  local.get $headingPtr
  global.set $assembly/zone-simulation/heading
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
 (func $~lib/math/NativeMathf.atan (param $x f32) (result f32)
  (local $ix i32)
  (local $sx f32)
  (local $z f32)
  (local $id i32)
  (local $w f32)
  (local $s1 f32)
  (local $s2 f32)
  (local $s3 f32)
  (local $9 i32)
  local.get $x
  i32.reinterpret_f32
  local.set $ix
  local.get $x
  local.set $sx
  local.get $ix
  i32.const 2147483647
  i32.and
  local.set $ix
  local.get $ix
  i32.const 1283457024
  i32.ge_u
  if
   local.get $x
   local.get $x
   f32.ne
   if
    local.get $x
    return
   end
   f32.const 1.570796251296997
   f32.const 7.52316384526264e-37
   f32.add
   local.set $z
   local.get $z
   local.get $sx
   f32.copysign
   return
  end
  local.get $ix
  i32.const 1054867456
  i32.lt_u
  if
   local.get $ix
   i32.const 964689920
   i32.lt_u
   if
    local.get $x
    return
   end
   i32.const -1
   local.set $id
  else
   local.get $x
   f32.abs
   local.set $x
   local.get $ix
   i32.const 1066926080
   i32.lt_u
   if
    local.get $ix
    i32.const 1060110336
    i32.lt_u
    if
     i32.const 0
     local.set $id
     f32.const 2
     local.get $x
     f32.mul
     f32.const 1
     f32.sub
     f32.const 2
     local.get $x
     f32.add
     f32.div
     local.set $x
    else
     i32.const 1
     local.set $id
     local.get $x
     f32.const 1
     f32.sub
     local.get $x
     f32.const 1
     f32.add
     f32.div
     local.set $x
    end
   else
    local.get $ix
    i32.const 1075576832
    i32.lt_u
    if
     i32.const 2
     local.set $id
     local.get $x
     f32.const 1.5
     f32.sub
     f32.const 1
     f32.const 1.5
     local.get $x
     f32.mul
     f32.add
     f32.div
     local.set $x
    else
     i32.const 3
     local.set $id
     f32.const -1
     local.get $x
     f32.div
     local.set $x
    end
   end
  end
  local.get $x
  local.get $x
  f32.mul
  local.set $z
  local.get $z
  local.get $z
  f32.mul
  local.set $w
  local.get $z
  f32.const 0.333333283662796
  local.get $w
  f32.const 0.14253635704517365
  local.get $w
  f32.const 0.06168760731816292
  f32.mul
  f32.add
  f32.mul
  f32.add
  f32.mul
  local.set $s1
  local.get $w
  f32.const -0.19999158382415771
  local.get $w
  f32.const -0.106480173766613
  f32.mul
  f32.add
  f32.mul
  local.set $s2
  local.get $x
  local.get $s1
  local.get $s2
  f32.add
  f32.mul
  local.set $s3
  local.get $id
  i32.const 0
  i32.lt_s
  if
   local.get $x
   local.get $s3
   f32.sub
   return
  end
  block $break|0
   block $case4|0
    block $case3|0
     block $case2|0
      block $case1|0
       block $case0|0
        local.get $id
        local.set $9
        local.get $9
        i32.const 0
        i32.eq
        br_if $case0|0
        local.get $9
        i32.const 1
        i32.eq
        br_if $case1|0
        local.get $9
        i32.const 2
        i32.eq
        br_if $case2|0
        local.get $9
        i32.const 3
        i32.eq
        br_if $case3|0
        br $case4|0
       end
       f32.const 0.46364760398864746
       local.get $s3
       f32.const 5.01215824399992e-09
       f32.sub
       local.get $x
       f32.sub
       f32.sub
       local.set $z
       br $break|0
      end
      f32.const 0.7853981256484985
      local.get $s3
      f32.const 3.774894707930798e-08
      f32.sub
      local.get $x
      f32.sub
      f32.sub
      local.set $z
      br $break|0
     end
     f32.const 0.9827936887741089
     local.get $s3
     f32.const 3.447321716976148e-08
     f32.sub
     local.get $x
     f32.sub
     f32.sub
     local.set $z
     br $break|0
    end
    f32.const 1.570796251296997
    local.get $s3
    f32.const 7.549789415861596e-08
    f32.sub
    local.get $x
    f32.sub
    f32.sub
    local.set $z
    br $break|0
   end
   unreachable
  end
  local.get $z
  local.get $sx
  f32.copysign
  return
 )
 (func $~lib/math/NativeMathf.atan2 (param $y f32) (param $x f32) (result f32)
  (local $ix i32)
  (local $iy i32)
  (local $m i32)
  (local $5 i32)
  (local $t f32)
  (local $t|7 f32)
  (local $z f32)
  (local $9 i32)
  local.get $x
  local.get $x
  f32.ne
  if (result i32)
   i32.const 1
  else
   local.get $y
   local.get $y
   f32.ne
  end
  if
   local.get $x
   local.get $y
   f32.add
   return
  end
  local.get $x
  i32.reinterpret_f32
  local.set $ix
  local.get $y
  i32.reinterpret_f32
  local.set $iy
  local.get $ix
  i32.const 1065353216
  i32.eq
  if
   local.get $y
   call $~lib/math/NativeMathf.atan
   return
  end
  local.get $iy
  i32.const 31
  i32.shr_u
  i32.const 1
  i32.and
  local.get $ix
  i32.const 30
  i32.shr_u
  i32.const 2
  i32.and
  i32.or
  local.set $m
  local.get $ix
  i32.const 2147483647
  i32.and
  local.set $ix
  local.get $iy
  i32.const 2147483647
  i32.and
  local.set $iy
  local.get $iy
  i32.const 0
  i32.eq
  if
   block $break|0
    block $case3|0
     block $case2|0
      block $case1|0
       block $case0|0
        local.get $m
        local.set $5
        local.get $5
        i32.const 0
        i32.eq
        br_if $case0|0
        local.get $5
        i32.const 1
        i32.eq
        br_if $case1|0
        local.get $5
        i32.const 2
        i32.eq
        br_if $case2|0
        local.get $5
        i32.const 3
        i32.eq
        br_if $case3|0
        br $break|0
       end
      end
      local.get $y
      return
     end
     f32.const 3.1415927410125732
     return
    end
    f32.const 3.1415927410125732
    f32.neg
    return
   end
  end
  local.get $ix
  i32.const 0
  i32.eq
  if
   local.get $m
   i32.const 1
   i32.and
   if (result f32)
    f32.const 3.1415927410125732
    f32.neg
    f32.const 2
    f32.div
   else
    f32.const 3.1415927410125732
    f32.const 2
    f32.div
   end
   return
  end
  local.get $ix
  i32.const 2139095040
  i32.eq
  if
   local.get $iy
   i32.const 2139095040
   i32.eq
   if
    local.get $m
    i32.const 2
    i32.and
    if (result f32)
     f32.const 3
     f32.const 3.1415927410125732
     f32.mul
     f32.const 4
     f32.div
    else
     f32.const 3.1415927410125732
     f32.const 4
     f32.div
    end
    local.set $t
    local.get $m
    i32.const 1
    i32.and
    if (result f32)
     local.get $t
     f32.neg
    else
     local.get $t
    end
    return
   else
    local.get $m
    i32.const 2
    i32.and
    if (result f32)
     f32.const 3.1415927410125732
    else
     f32.const 0
    end
    local.set $t|7
    local.get $m
    i32.const 1
    i32.and
    if (result f32)
     local.get $t|7
     f32.neg
    else
     local.get $t|7
    end
    return
   end
   unreachable
  end
  local.get $ix
  i32.const 26
  i32.const 23
  i32.shl
  i32.add
  local.get $iy
  i32.lt_u
  if (result i32)
   i32.const 1
  else
   local.get $iy
   i32.const 2139095040
   i32.eq
  end
  if
   local.get $m
   i32.const 1
   i32.and
   if (result f32)
    f32.const 3.1415927410125732
    f32.neg
    f32.const 2
    f32.div
   else
    f32.const 3.1415927410125732
    f32.const 2
    f32.div
   end
   return
  end
  local.get $m
  i32.const 2
  i32.and
  if (result i32)
   local.get $iy
   i32.const 26
   i32.const 23
   i32.shl
   i32.add
   local.get $ix
   i32.lt_u
  else
   i32.const 0
  end
  if
   f32.const 0
   local.set $z
  else
   local.get $y
   local.get $x
   f32.div
   f32.abs
   call $~lib/math/NativeMathf.atan
   local.set $z
  end
  block $break|1
   block $case3|1
    block $case2|1
     block $case1|1
      block $case0|1
       local.get $m
       local.set $9
       local.get $9
       i32.const 0
       i32.eq
       br_if $case0|1
       local.get $9
       i32.const 1
       i32.eq
       br_if $case1|1
       local.get $9
       i32.const 2
       i32.eq
       br_if $case2|1
       local.get $9
       i32.const 3
       i32.eq
       br_if $case3|1
       br $break|1
      end
      local.get $z
      return
     end
     local.get $z
     f32.neg
     return
    end
    f32.const 3.1415927410125732
    local.get $z
    f32.const -8.742277657347586e-08
    f32.sub
    f32.sub
    return
   end
   local.get $z
   f32.const -8.742277657347586e-08
   f32.sub
   f32.const 3.1415927410125732
   f32.sub
   return
  end
  unreachable
 )
 (func $~lib/math/NativeMathf.sin (param $x f32) (result f32)
  (local $ux i32)
  (local $sign i32)
  (local $x|3 f64)
  (local $z f64)
  (local $w f64)
  (local $r f64)
  (local $s f64)
  (local $x|8 f64)
  (local $z|9 f64)
  (local $w|10 f64)
  (local $r|11 f64)
  (local $x|12 f64)
  (local $z|13 f64)
  (local $w|14 f64)
  (local $r|15 f64)
  (local $x|16 f64)
  (local $z|17 f64)
  (local $w|18 f64)
  (local $r|19 f64)
  (local $s|20 f64)
  (local $x|21 f64)
  (local $z|22 f64)
  (local $w|23 f64)
  (local $r|24 f64)
  (local $x|25 f64)
  (local $z|26 f64)
  (local $w|27 f64)
  (local $r|28 f64)
  (local $x|29 f64)
  (local $z|30 f64)
  (local $w|31 f64)
  (local $r|32 f64)
  (local $s|33 f64)
  (local $x|34 f32)
  (local $u i32)
  (local $sign|36 i32)
  (local $q f64)
  (local $x|38 f32)
  (local $u|39 i32)
  (local $offset i32)
  (local $shift i64)
  (local $tblPtr i32)
  (local $b0 i64)
  (local $b1 i64)
  (local $lo i64)
  (local $b2 i64)
  (local $hi i64)
  (local $mantissa i64)
  (local $product i64)
  (local $r|50 i64)
  (local $q|51 i32)
  (local $q|52 i32)
  (local $n i32)
  (local $y f64)
  (local $x|55 f64)
  (local $z|56 f64)
  (local $w|57 f64)
  (local $r|58 f64)
  (local $x|59 f64)
  (local $z|60 f64)
  (local $w|61 f64)
  (local $r|62 f64)
  (local $s|63 f64)
  (local $t f32)
  local.get $x
  i32.reinterpret_f32
  local.set $ux
  local.get $ux
  i32.const 31
  i32.shr_u
  local.set $sign
  local.get $ux
  i32.const 2147483647
  i32.and
  local.set $ux
  local.get $ux
  i32.const 1061752794
  i32.le_u
  if
   local.get $ux
   i32.const 964689920
   i32.lt_u
   if
    local.get $x
    return
   end
   block $~lib/math/sin_kernf|inlined.0 (result f32)
    local.get $x
    f64.promote_f32
    local.set $x|3
    local.get $x|3
    local.get $x|3
    f64.mul
    local.set $z
    local.get $z
    local.get $z
    f64.mul
    local.set $w
    f64.const -1.9839334836096632e-04
    local.get $z
    f64.const 2.718311493989822e-06
    f64.mul
    f64.add
    local.set $r
    local.get $z
    local.get $x|3
    f64.mul
    local.set $s
    local.get $x|3
    local.get $s
    f64.const -0.16666666641626524
    local.get $z
    f64.const 0.008333329385889463
    f64.mul
    f64.add
    f64.mul
    f64.add
    local.get $s
    local.get $w
    f64.mul
    local.get $r
    f64.mul
    f64.add
    f32.demote_f64
    br $~lib/math/sin_kernf|inlined.0
   end
   return
  end
  i32.const 0
  i32.const 1
  i32.lt_s
  drop
  local.get $ux
  i32.const 1081824209
  i32.le_u
  if
   local.get $ux
   i32.const 1075235811
   i32.le_u
   if
    local.get $sign
    if (result f32)
     block $~lib/math/cos_kernf|inlined.0 (result f32)
      local.get $x
      f64.promote_f32
      f64.const 1.5707963267948966
      f64.add
      local.set $x|8
      local.get $x|8
      local.get $x|8
      f64.mul
      local.set $z|9
      local.get $z|9
      local.get $z|9
      f64.mul
      local.set $w|10
      f64.const -0.001388676377460993
      local.get $z|9
      f64.const 2.439044879627741e-05
      f64.mul
      f64.add
      local.set $r|11
      f32.const 1
      f64.promote_f32
      local.get $z|9
      f64.const -0.499999997251031
      f64.mul
      f64.add
      local.get $w|10
      f64.const 0.04166662332373906
      f64.mul
      f64.add
      local.get $w|10
      local.get $z|9
      f64.mul
      local.get $r|11
      f64.mul
      f64.add
      f32.demote_f64
      br $~lib/math/cos_kernf|inlined.0
     end
     f32.neg
    else
     block $~lib/math/cos_kernf|inlined.1 (result f32)
      local.get $x
      f64.promote_f32
      f64.const 1.5707963267948966
      f64.sub
      local.set $x|12
      local.get $x|12
      local.get $x|12
      f64.mul
      local.set $z|13
      local.get $z|13
      local.get $z|13
      f64.mul
      local.set $w|14
      f64.const -0.001388676377460993
      local.get $z|13
      f64.const 2.439044879627741e-05
      f64.mul
      f64.add
      local.set $r|15
      f32.const 1
      f64.promote_f32
      local.get $z|13
      f64.const -0.499999997251031
      f64.mul
      f64.add
      local.get $w|14
      f64.const 0.04166662332373906
      f64.mul
      f64.add
      local.get $w|14
      local.get $z|13
      f64.mul
      local.get $r|15
      f64.mul
      f64.add
      f32.demote_f64
      br $~lib/math/cos_kernf|inlined.1
     end
    end
    return
   end
   block $~lib/math/sin_kernf|inlined.1 (result f32)
    local.get $sign
    if (result f64)
     local.get $x
     f64.promote_f32
     f64.const 3.141592653589793
     f64.add
    else
     local.get $x
     f64.promote_f32
     f64.const 3.141592653589793
     f64.sub
    end
    f64.neg
    local.set $x|16
    local.get $x|16
    local.get $x|16
    f64.mul
    local.set $z|17
    local.get $z|17
    local.get $z|17
    f64.mul
    local.set $w|18
    f64.const -1.9839334836096632e-04
    local.get $z|17
    f64.const 2.718311493989822e-06
    f64.mul
    f64.add
    local.set $r|19
    local.get $z|17
    local.get $x|16
    f64.mul
    local.set $s|20
    local.get $x|16
    local.get $s|20
    f64.const -0.16666666641626524
    local.get $z|17
    f64.const 0.008333329385889463
    f64.mul
    f64.add
    f64.mul
    f64.add
    local.get $s|20
    local.get $w|18
    f64.mul
    local.get $r|19
    f64.mul
    f64.add
    f32.demote_f64
    br $~lib/math/sin_kernf|inlined.1
   end
   return
  end
  local.get $ux
  i32.const 1088565717
  i32.le_u
  if
   local.get $ux
   i32.const 1085271519
   i32.le_u
   if
    local.get $sign
    if (result f32)
     block $~lib/math/cos_kernf|inlined.2 (result f32)
      local.get $x
      f64.promote_f32
      f64.const 4.71238898038469
      f64.add
      local.set $x|21
      local.get $x|21
      local.get $x|21
      f64.mul
      local.set $z|22
      local.get $z|22
      local.get $z|22
      f64.mul
      local.set $w|23
      f64.const -0.001388676377460993
      local.get $z|22
      f64.const 2.439044879627741e-05
      f64.mul
      f64.add
      local.set $r|24
      f32.const 1
      f64.promote_f32
      local.get $z|22
      f64.const -0.499999997251031
      f64.mul
      f64.add
      local.get $w|23
      f64.const 0.04166662332373906
      f64.mul
      f64.add
      local.get $w|23
      local.get $z|22
      f64.mul
      local.get $r|24
      f64.mul
      f64.add
      f32.demote_f64
      br $~lib/math/cos_kernf|inlined.2
     end
    else
     block $~lib/math/cos_kernf|inlined.3 (result f32)
      local.get $x
      f64.promote_f32
      f64.const 4.71238898038469
      f64.sub
      local.set $x|25
      local.get $x|25
      local.get $x|25
      f64.mul
      local.set $z|26
      local.get $z|26
      local.get $z|26
      f64.mul
      local.set $w|27
      f64.const -0.001388676377460993
      local.get $z|26
      f64.const 2.439044879627741e-05
      f64.mul
      f64.add
      local.set $r|28
      f32.const 1
      f64.promote_f32
      local.get $z|26
      f64.const -0.499999997251031
      f64.mul
      f64.add
      local.get $w|27
      f64.const 0.04166662332373906
      f64.mul
      f64.add
      local.get $w|27
      local.get $z|26
      f64.mul
      local.get $r|28
      f64.mul
      f64.add
      f32.demote_f64
      br $~lib/math/cos_kernf|inlined.3
     end
     f32.neg
    end
    return
   end
   block $~lib/math/sin_kernf|inlined.2 (result f32)
    local.get $sign
    if (result f64)
     local.get $x
     f64.promote_f32
     f64.const 6.283185307179586
     f64.add
    else
     local.get $x
     f64.promote_f32
     f64.const 6.283185307179586
     f64.sub
    end
    local.set $x|29
    local.get $x|29
    local.get $x|29
    f64.mul
    local.set $z|30
    local.get $z|30
    local.get $z|30
    f64.mul
    local.set $w|31
    f64.const -1.9839334836096632e-04
    local.get $z|30
    f64.const 2.718311493989822e-06
    f64.mul
    f64.add
    local.set $r|32
    local.get $z|30
    local.get $x|29
    f64.mul
    local.set $s|33
    local.get $x|29
    local.get $s|33
    f64.const -0.16666666641626524
    local.get $z|30
    f64.const 0.008333329385889463
    f64.mul
    f64.add
    f64.mul
    f64.add
    local.get $s|33
    local.get $w|31
    f64.mul
    local.get $r|32
    f64.mul
    f64.add
    f32.demote_f64
    br $~lib/math/sin_kernf|inlined.2
   end
   return
  end
  local.get $ux
  i32.const 2139095040
  i32.ge_u
  if
   local.get $x
   local.get $x
   f32.sub
   return
  end
  block $~lib/math/rempio2f|inlined.0 (result i32)
   local.get $x
   local.set $x|34
   local.get $ux
   local.set $u
   local.get $sign
   local.set $sign|36
   local.get $u
   i32.const 1305022427
   i32.lt_u
   if
    local.get $x|34
    f64.promote_f32
    f64.const 0.6366197723675814
    f64.mul
    f64.nearest
    local.set $q
    local.get $x|34
    f64.promote_f32
    local.get $q
    f64.const 1.5707963109016418
    f64.mul
    f64.sub
    local.get $q
    f64.const 1.5893254773528196e-08
    f64.mul
    f64.sub
    global.set $~lib/math/rempio2f_y
    local.get $q
    i32.trunc_sat_f64_s
    br $~lib/math/rempio2f|inlined.0
   end
   block $~lib/math/pio2f_large_quot|inlined.0 (result i32)
    local.get $x|34
    local.set $x|38
    local.get $u
    local.set $u|39
    local.get $u|39
    i32.const 23
    i32.shr_s
    i32.const 152
    i32.sub
    local.set $offset
    local.get $offset
    i32.const 63
    i32.and
    i64.extend_i32_s
    local.set $shift
    i32.const 256
    local.get $offset
    i32.const 6
    i32.shr_s
    i32.const 3
    i32.shl
    i32.add
    local.set $tblPtr
    local.get $tblPtr
    i64.load
    local.set $b0
    local.get $tblPtr
    i64.load offset=8
    local.set $b1
    local.get $shift
    i64.const 32
    i64.gt_u
    if
     local.get $tblPtr
     i64.load offset=16
     local.set $b2
     local.get $b2
     i64.const 96
     local.get $shift
     i64.sub
     i64.shr_u
     local.set $lo
     local.get $lo
     local.get $b1
     local.get $shift
     i64.const 32
     i64.sub
     i64.shl
     i64.or
     local.set $lo
    else
     local.get $b1
     i64.const 32
     local.get $shift
     i64.sub
     i64.shr_u
     local.set $lo
    end
    local.get $b1
    i64.const 64
    local.get $shift
    i64.sub
    i64.shr_u
    local.get $b0
    local.get $shift
    i64.shl
    i64.or
    local.set $hi
    local.get $u|39
    i32.const 8388607
    i32.and
    i32.const 8388608
    i32.or
    i64.extend_i32_s
    local.set $mantissa
    local.get $mantissa
    local.get $hi
    i64.mul
    local.get $mantissa
    local.get $lo
    i64.mul
    i64.const 32
    i64.shr_u
    i64.add
    local.set $product
    local.get $product
    i64.const 2
    i64.shl
    local.set $r|50
    local.get $product
    i64.const 62
    i64.shr_u
    local.get $r|50
    i64.const 63
    i64.shr_u
    i64.add
    i32.wrap_i64
    local.set $q|51
    f64.const 8.515303950216386e-20
    local.get $x|38
    f64.promote_f32
    f64.copysign
    local.get $r|50
    f64.convert_i64_s
    f64.mul
    global.set $~lib/math/rempio2f_y
    local.get $q|51
    br $~lib/math/pio2f_large_quot|inlined.0
   end
   local.set $q|52
   i32.const 0
   local.get $q|52
   i32.sub
   local.get $q|52
   local.get $sign|36
   select
   br $~lib/math/rempio2f|inlined.0
  end
  local.set $n
  global.get $~lib/math/rempio2f_y
  local.set $y
  local.get $n
  i32.const 1
  i32.and
  if (result f32)
   block $~lib/math/cos_kernf|inlined.4 (result f32)
    local.get $y
    local.set $x|55
    local.get $x|55
    local.get $x|55
    f64.mul
    local.set $z|56
    local.get $z|56
    local.get $z|56
    f64.mul
    local.set $w|57
    f64.const -0.001388676377460993
    local.get $z|56
    f64.const 2.439044879627741e-05
    f64.mul
    f64.add
    local.set $r|58
    f32.const 1
    f64.promote_f32
    local.get $z|56
    f64.const -0.499999997251031
    f64.mul
    f64.add
    local.get $w|57
    f64.const 0.04166662332373906
    f64.mul
    f64.add
    local.get $w|57
    local.get $z|56
    f64.mul
    local.get $r|58
    f64.mul
    f64.add
    f32.demote_f64
    br $~lib/math/cos_kernf|inlined.4
   end
  else
   block $~lib/math/sin_kernf|inlined.3 (result f32)
    local.get $y
    local.set $x|59
    local.get $x|59
    local.get $x|59
    f64.mul
    local.set $z|60
    local.get $z|60
    local.get $z|60
    f64.mul
    local.set $w|61
    f64.const -1.9839334836096632e-04
    local.get $z|60
    f64.const 2.718311493989822e-06
    f64.mul
    f64.add
    local.set $r|62
    local.get $z|60
    local.get $x|59
    f64.mul
    local.set $s|63
    local.get $x|59
    local.get $s|63
    f64.const -0.16666666641626524
    local.get $z|60
    f64.const 0.008333329385889463
    f64.mul
    f64.add
    f64.mul
    f64.add
    local.get $s|63
    local.get $w|61
    f64.mul
    local.get $r|62
    f64.mul
    f64.add
    f32.demote_f64
    br $~lib/math/sin_kernf|inlined.3
   end
  end
  local.set $t
  local.get $n
  i32.const 2
  i32.and
  if (result f32)
   local.get $t
   f32.neg
  else
   local.get $t
  end
  return
 )
 (func $~lib/math/NativeMathf.cos (param $x f32) (result f32)
  (local $ux i32)
  (local $sign i32)
  (local $x|3 f64)
  (local $z f64)
  (local $w f64)
  (local $r f64)
  (local $x|7 f64)
  (local $z|8 f64)
  (local $w|9 f64)
  (local $r|10 f64)
  (local $x|11 f64)
  (local $z|12 f64)
  (local $w|13 f64)
  (local $r|14 f64)
  (local $s f64)
  (local $x|16 f64)
  (local $z|17 f64)
  (local $w|18 f64)
  (local $r|19 f64)
  (local $s|20 f64)
  (local $x|21 f64)
  (local $z|22 f64)
  (local $w|23 f64)
  (local $r|24 f64)
  (local $x|25 f64)
  (local $z|26 f64)
  (local $w|27 f64)
  (local $r|28 f64)
  (local $s|29 f64)
  (local $x|30 f64)
  (local $z|31 f64)
  (local $w|32 f64)
  (local $r|33 f64)
  (local $s|34 f64)
  (local $x|35 f32)
  (local $u i32)
  (local $sign|37 i32)
  (local $q f64)
  (local $x|39 f32)
  (local $u|40 i32)
  (local $offset i32)
  (local $shift i64)
  (local $tblPtr i32)
  (local $b0 i64)
  (local $b1 i64)
  (local $lo i64)
  (local $b2 i64)
  (local $hi i64)
  (local $mantissa i64)
  (local $product i64)
  (local $r|51 i64)
  (local $q|52 i32)
  (local $q|53 i32)
  (local $n i32)
  (local $y f64)
  (local $x|56 f64)
  (local $z|57 f64)
  (local $w|58 f64)
  (local $r|59 f64)
  (local $s|60 f64)
  (local $x|61 f64)
  (local $z|62 f64)
  (local $w|63 f64)
  (local $r|64 f64)
  (local $t f32)
  local.get $x
  i32.reinterpret_f32
  local.set $ux
  local.get $ux
  i32.const 31
  i32.shr_u
  local.set $sign
  local.get $ux
  i32.const 2147483647
  i32.and
  local.set $ux
  local.get $ux
  i32.const 1061752794
  i32.le_u
  if
   local.get $ux
   i32.const 964689920
   i32.lt_u
   if
    f32.const 1
    return
   end
   block $~lib/math/cos_kernf|inlined.5 (result f32)
    local.get $x
    f64.promote_f32
    local.set $x|3
    local.get $x|3
    local.get $x|3
    f64.mul
    local.set $z
    local.get $z
    local.get $z
    f64.mul
    local.set $w
    f64.const -0.001388676377460993
    local.get $z
    f64.const 2.439044879627741e-05
    f64.mul
    f64.add
    local.set $r
    f32.const 1
    f64.promote_f32
    local.get $z
    f64.const -0.499999997251031
    f64.mul
    f64.add
    local.get $w
    f64.const 0.04166662332373906
    f64.mul
    f64.add
    local.get $w
    local.get $z
    f64.mul
    local.get $r
    f64.mul
    f64.add
    f32.demote_f64
    br $~lib/math/cos_kernf|inlined.5
   end
   return
  end
  i32.const 0
  i32.const 1
  i32.lt_s
  drop
  local.get $ux
  i32.const 1081824209
  i32.le_u
  if
   local.get $ux
   i32.const 1075235811
   i32.gt_u
   if
    block $~lib/math/cos_kernf|inlined.6 (result f32)
     local.get $sign
     if (result f64)
      local.get $x
      f64.promote_f32
      f64.const 3.141592653589793
      f64.add
     else
      local.get $x
      f64.promote_f32
      f64.const 3.141592653589793
      f64.sub
     end
     local.set $x|7
     local.get $x|7
     local.get $x|7
     f64.mul
     local.set $z|8
     local.get $z|8
     local.get $z|8
     f64.mul
     local.set $w|9
     f64.const -0.001388676377460993
     local.get $z|8
     f64.const 2.439044879627741e-05
     f64.mul
     f64.add
     local.set $r|10
     f32.const 1
     f64.promote_f32
     local.get $z|8
     f64.const -0.499999997251031
     f64.mul
     f64.add
     local.get $w|9
     f64.const 0.04166662332373906
     f64.mul
     f64.add
     local.get $w|9
     local.get $z|8
     f64.mul
     local.get $r|10
     f64.mul
     f64.add
     f32.demote_f64
     br $~lib/math/cos_kernf|inlined.6
    end
    f32.neg
    return
   else
    local.get $sign
    if (result f32)
     block $~lib/math/sin_kernf|inlined.4 (result f32)
      local.get $x
      f64.promote_f32
      f64.const 1.5707963267948966
      f64.add
      local.set $x|11
      local.get $x|11
      local.get $x|11
      f64.mul
      local.set $z|12
      local.get $z|12
      local.get $z|12
      f64.mul
      local.set $w|13
      f64.const -1.9839334836096632e-04
      local.get $z|12
      f64.const 2.718311493989822e-06
      f64.mul
      f64.add
      local.set $r|14
      local.get $z|12
      local.get $x|11
      f64.mul
      local.set $s
      local.get $x|11
      local.get $s
      f64.const -0.16666666641626524
      local.get $z|12
      f64.const 0.008333329385889463
      f64.mul
      f64.add
      f64.mul
      f64.add
      local.get $s
      local.get $w|13
      f64.mul
      local.get $r|14
      f64.mul
      f64.add
      f32.demote_f64
      br $~lib/math/sin_kernf|inlined.4
     end
    else
     block $~lib/math/sin_kernf|inlined.5 (result f32)
      f64.const 1.5707963267948966
      local.get $x
      f64.promote_f32
      f64.sub
      local.set $x|16
      local.get $x|16
      local.get $x|16
      f64.mul
      local.set $z|17
      local.get $z|17
      local.get $z|17
      f64.mul
      local.set $w|18
      f64.const -1.9839334836096632e-04
      local.get $z|17
      f64.const 2.718311493989822e-06
      f64.mul
      f64.add
      local.set $r|19
      local.get $z|17
      local.get $x|16
      f64.mul
      local.set $s|20
      local.get $x|16
      local.get $s|20
      f64.const -0.16666666641626524
      local.get $z|17
      f64.const 0.008333329385889463
      f64.mul
      f64.add
      f64.mul
      f64.add
      local.get $s|20
      local.get $w|18
      f64.mul
      local.get $r|19
      f64.mul
      f64.add
      f32.demote_f64
      br $~lib/math/sin_kernf|inlined.5
     end
    end
    return
   end
   unreachable
  end
  local.get $ux
  i32.const 1088565717
  i32.le_u
  if
   local.get $ux
   i32.const 1085271519
   i32.gt_u
   if
    block $~lib/math/cos_kernf|inlined.7 (result f32)
     local.get $sign
     if (result f64)
      local.get $x
      f64.promote_f32
      f64.const 6.283185307179586
      f64.add
     else
      local.get $x
      f64.promote_f32
      f64.const 6.283185307179586
      f64.sub
     end
     local.set $x|21
     local.get $x|21
     local.get $x|21
     f64.mul
     local.set $z|22
     local.get $z|22
     local.get $z|22
     f64.mul
     local.set $w|23
     f64.const -0.001388676377460993
     local.get $z|22
     f64.const 2.439044879627741e-05
     f64.mul
     f64.add
     local.set $r|24
     f32.const 1
     f64.promote_f32
     local.get $z|22
     f64.const -0.499999997251031
     f64.mul
     f64.add
     local.get $w|23
     f64.const 0.04166662332373906
     f64.mul
     f64.add
     local.get $w|23
     local.get $z|22
     f64.mul
     local.get $r|24
     f64.mul
     f64.add
     f32.demote_f64
     br $~lib/math/cos_kernf|inlined.7
    end
    return
   else
    local.get $sign
    if (result f32)
     block $~lib/math/sin_kernf|inlined.6 (result f32)
      local.get $x
      f32.neg
      f64.promote_f32
      f64.const 4.71238898038469
      f64.sub
      local.set $x|25
      local.get $x|25
      local.get $x|25
      f64.mul
      local.set $z|26
      local.get $z|26
      local.get $z|26
      f64.mul
      local.set $w|27
      f64.const -1.9839334836096632e-04
      local.get $z|26
      f64.const 2.718311493989822e-06
      f64.mul
      f64.add
      local.set $r|28
      local.get $z|26
      local.get $x|25
      f64.mul
      local.set $s|29
      local.get $x|25
      local.get $s|29
      f64.const -0.16666666641626524
      local.get $z|26
      f64.const 0.008333329385889463
      f64.mul
      f64.add
      f64.mul
      f64.add
      local.get $s|29
      local.get $w|27
      f64.mul
      local.get $r|28
      f64.mul
      f64.add
      f32.demote_f64
      br $~lib/math/sin_kernf|inlined.6
     end
    else
     block $~lib/math/sin_kernf|inlined.7 (result f32)
      local.get $x
      f64.promote_f32
      f64.const 4.71238898038469
      f64.sub
      local.set $x|30
      local.get $x|30
      local.get $x|30
      f64.mul
      local.set $z|31
      local.get $z|31
      local.get $z|31
      f64.mul
      local.set $w|32
      f64.const -1.9839334836096632e-04
      local.get $z|31
      f64.const 2.718311493989822e-06
      f64.mul
      f64.add
      local.set $r|33
      local.get $z|31
      local.get $x|30
      f64.mul
      local.set $s|34
      local.get $x|30
      local.get $s|34
      f64.const -0.16666666641626524
      local.get $z|31
      f64.const 0.008333329385889463
      f64.mul
      f64.add
      f64.mul
      f64.add
      local.get $s|34
      local.get $w|32
      f64.mul
      local.get $r|33
      f64.mul
      f64.add
      f32.demote_f64
      br $~lib/math/sin_kernf|inlined.7
     end
    end
    return
   end
   unreachable
  end
  local.get $ux
  i32.const 2139095040
  i32.ge_u
  if
   local.get $x
   local.get $x
   f32.sub
   return
  end
  block $~lib/math/rempio2f|inlined.1 (result i32)
   local.get $x
   local.set $x|35
   local.get $ux
   local.set $u
   local.get $sign
   local.set $sign|37
   local.get $u
   i32.const 1305022427
   i32.lt_u
   if
    local.get $x|35
    f64.promote_f32
    f64.const 0.6366197723675814
    f64.mul
    f64.nearest
    local.set $q
    local.get $x|35
    f64.promote_f32
    local.get $q
    f64.const 1.5707963109016418
    f64.mul
    f64.sub
    local.get $q
    f64.const 1.5893254773528196e-08
    f64.mul
    f64.sub
    global.set $~lib/math/rempio2f_y
    local.get $q
    i32.trunc_sat_f64_s
    br $~lib/math/rempio2f|inlined.1
   end
   block $~lib/math/pio2f_large_quot|inlined.1 (result i32)
    local.get $x|35
    local.set $x|39
    local.get $u
    local.set $u|40
    local.get $u|40
    i32.const 23
    i32.shr_s
    i32.const 152
    i32.sub
    local.set $offset
    local.get $offset
    i32.const 63
    i32.and
    i64.extend_i32_s
    local.set $shift
    i32.const 256
    local.get $offset
    i32.const 6
    i32.shr_s
    i32.const 3
    i32.shl
    i32.add
    local.set $tblPtr
    local.get $tblPtr
    i64.load
    local.set $b0
    local.get $tblPtr
    i64.load offset=8
    local.set $b1
    local.get $shift
    i64.const 32
    i64.gt_u
    if
     local.get $tblPtr
     i64.load offset=16
     local.set $b2
     local.get $b2
     i64.const 96
     local.get $shift
     i64.sub
     i64.shr_u
     local.set $lo
     local.get $lo
     local.get $b1
     local.get $shift
     i64.const 32
     i64.sub
     i64.shl
     i64.or
     local.set $lo
    else
     local.get $b1
     i64.const 32
     local.get $shift
     i64.sub
     i64.shr_u
     local.set $lo
    end
    local.get $b1
    i64.const 64
    local.get $shift
    i64.sub
    i64.shr_u
    local.get $b0
    local.get $shift
    i64.shl
    i64.or
    local.set $hi
    local.get $u|40
    i32.const 8388607
    i32.and
    i32.const 8388608
    i32.or
    i64.extend_i32_s
    local.set $mantissa
    local.get $mantissa
    local.get $hi
    i64.mul
    local.get $mantissa
    local.get $lo
    i64.mul
    i64.const 32
    i64.shr_u
    i64.add
    local.set $product
    local.get $product
    i64.const 2
    i64.shl
    local.set $r|51
    local.get $product
    i64.const 62
    i64.shr_u
    local.get $r|51
    i64.const 63
    i64.shr_u
    i64.add
    i32.wrap_i64
    local.set $q|52
    f64.const 8.515303950216386e-20
    local.get $x|39
    f64.promote_f32
    f64.copysign
    local.get $r|51
    f64.convert_i64_s
    f64.mul
    global.set $~lib/math/rempio2f_y
    local.get $q|52
    br $~lib/math/pio2f_large_quot|inlined.1
   end
   local.set $q|53
   i32.const 0
   local.get $q|53
   i32.sub
   local.get $q|53
   local.get $sign|37
   select
   br $~lib/math/rempio2f|inlined.1
  end
  local.set $n
  global.get $~lib/math/rempio2f_y
  local.set $y
  local.get $n
  i32.const 1
  i32.and
  if (result f32)
   block $~lib/math/sin_kernf|inlined.8 (result f32)
    local.get $y
    local.set $x|56
    local.get $x|56
    local.get $x|56
    f64.mul
    local.set $z|57
    local.get $z|57
    local.get $z|57
    f64.mul
    local.set $w|58
    f64.const -1.9839334836096632e-04
    local.get $z|57
    f64.const 2.718311493989822e-06
    f64.mul
    f64.add
    local.set $r|59
    local.get $z|57
    local.get $x|56
    f64.mul
    local.set $s|60
    local.get $x|56
    local.get $s|60
    f64.const -0.16666666641626524
    local.get $z|57
    f64.const 0.008333329385889463
    f64.mul
    f64.add
    f64.mul
    f64.add
    local.get $s|60
    local.get $w|58
    f64.mul
    local.get $r|59
    f64.mul
    f64.add
    f32.demote_f64
    br $~lib/math/sin_kernf|inlined.8
   end
  else
   block $~lib/math/cos_kernf|inlined.8 (result f32)
    local.get $y
    local.set $x|61
    local.get $x|61
    local.get $x|61
    f64.mul
    local.set $z|62
    local.get $z|62
    local.get $z|62
    f64.mul
    local.set $w|63
    f64.const -0.001388676377460993
    local.get $z|62
    f64.const 2.439044879627741e-05
    f64.mul
    f64.add
    local.set $r|64
    f32.const 1
    f64.promote_f32
    local.get $z|62
    f64.const -0.499999997251031
    f64.mul
    f64.add
    local.get $w|63
    f64.const 0.04166662332373906
    f64.mul
    f64.add
    local.get $w|63
    local.get $z|62
    f64.mul
    local.get $r|64
    f64.mul
    f64.add
    f32.demote_f64
    br $~lib/math/cos_kernf|inlined.8
   end
  end
  local.set $t
  local.get $n
  i32.const 1
  i32.add
  i32.const 2
  i32.and
  if (result f32)
   local.get $t
   f32.neg
  else
   local.get $t
  end
  return
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
  (local $wasMoving|19 i32)
  (local $step f32)
  (local $yaw f32)
  (local $halfYaw f32)
  (local $orientationOffset i32)
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
  local.get $dt
  f32.const 0
  f32.le
  if
   return
  end
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
     f32.const 0
     f32.le
     if
      global.get $assembly/zone-simulation/movementState
      local.get $i
      i32.const 1
      i32.shl
      i32.add
      i32.load16_u
      i32.const 0
      i32.ne
      local.set $wasMoving|19
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
      local.get $wasMoving|19
      if
       local.get $i
       call $assembly/zone-simulation/markDirty
      end
      br $for-continue|0
     end
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
     local.get $dz
     f32.neg
     local.get $inverseDistance
     f32.mul
     local.get $dx
     local.get $inverseDistance
     f32.mul
     call $~lib/math/NativeMathf.atan2
     local.set $yaw
     local.get $yaw
     f32.const 0.5
     f32.mul
     local.set $halfYaw
     local.get $i
     i32.const 16
     i32.mul
     local.set $orientationOffset
     global.get $assembly/zone-simulation/heading
     local.get $scalarOffset
     i32.add
     local.get $yaw
     f32.store
     global.get $assembly/zone-simulation/orientationX
     local.get $orientationOffset
     i32.add
     f32.const 0
     f32.store
     global.get $assembly/zone-simulation/orientationY
     local.get $orientationOffset
     i32.add
     local.get $halfYaw
     call $~lib/math/NativeMathf.sin
     f32.store
     global.get $assembly/zone-simulation/orientationZ
     local.get $orientationOffset
     i32.add
     f32.const 0
     f32.store
     global.get $assembly/zone-simulation/orientationW
     local.get $orientationOffset
     i32.add
     local.get $halfYaw
     call $~lib/math/NativeMathf.cos
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
