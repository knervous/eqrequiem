(module
 (type $0 (func))
 (type $1 (func (param i32) (result i32)))
 (type $2 (func (param i32 i32 f32 f32 f32 f32 f32)))
 (global $../common/assembly/requiem-entity-reducer/ACTOR_STRIDE_BYTES i32 (i32.const 128))
 (global $../common/assembly/requiem-entity-reducer/ACTOR_TRANSLATION_OFFSET i32 (i32.const 0))
 (global $../common/assembly/requiem-entity-reducer/ACTOR_VISIBLE_INDEX_OFFSET i32 (i32.const 48))
 (global $../common/assembly/requiem-entity-reducer/ACTOR_VISIBLE_FLAG_OFFSET i32 (i32.const 96))
 (global $../common/assembly/requiem-entity-reducer/CONTAINER_VISIBLE_COUNT_OFFSET i32 (i32.const 0))
 (global $../common/assembly/requiem-entity-reducer/CONTAINER_INSTANCES_PTR_OFFSET i32 (i32.const 4))
 (global $../common/assembly/requiem-entity-reducer/CONTAINER_INSTANCES_COUNT_OFFSET i32 (i32.const 8))
 (global $../common/assembly/requiem-entity-reducer/heap (mut i32) (i32.const 0))
 (memory $0 0)
 (table $0 1 1 funcref)
 (elem $0 (i32.const 1))
 (export "alloc" (func $../common/assembly/requiem-entity-reducer/alloc))
 (export "frustumMarkAoS" (func $../common/assembly/requiem-entity-reducer/frustumMarkAoS))
 (export "memory" (memory $0))
 (start $~start)
 (func $start:../common/assembly/requiem-entity-reducer
  memory.size
  i32.const 16
  i32.shl
  global.set $../common/assembly/requiem-entity-reducer/heap
 )
 (func $../common/assembly/requiem-entity-reducer/alloc (param $bytes i32) (result i32)
  (local $pointer i32)
  (local $required i32)
  (local $requiredPages i32)
  (local $currentPages i32)
  global.get $../common/assembly/requiem-entity-reducer/heap
  local.set $pointer
  local.get $pointer
  local.get $bytes
  i32.add
  local.set $required
  local.get $required
  i32.const 65535
  i32.add
  i32.const 16
  i32.shr_u
  local.set $requiredPages
  memory.size
  local.set $currentPages
  local.get $requiredPages
  local.get $currentPages
  i32.gt_s
  if
   local.get $requiredPages
   local.get $currentPages
   i32.sub
   memory.grow
   drop
  end
  local.get $required
  global.set $../common/assembly/requiem-entity-reducer/heap
  local.get $pointer
  return
 )
 (func $../common/assembly/requiem-entity-reducer/frustumMarkAoS (param $base i32) (param $planesPtr i32) (param $baseRadius f32) (param $cameraX f32) (param $cameraY f32) (param $cameraZ f32) (param $maxDistance f32)
  (local $count i32)
  (local $instances i32)
  (local $writePointer i32)
  (local $visibleCount i32)
  (local $limit i32)
  (local $index i32)
  (local $actor i32)
  (local $x f32)
  (local $y f32)
  (local $z f32)
  (local $scale f32)
  (local $radius f32)
  (local $dx f32)
  (local $dy f32)
  (local $dz f32)
  (local $distance f32)
  (local $inside i32)
  (local $plane i32)
  (local $offset i32)
  (local $distance|26 f32)
  local.get $base
  global.get $../common/assembly/requiem-entity-reducer/CONTAINER_INSTANCES_COUNT_OFFSET
  i32.add
  i32.load
  local.set $count
  local.get $count
  i32.const 0
  i32.eq
  if
   local.get $base
   global.get $../common/assembly/requiem-entity-reducer/CONTAINER_VISIBLE_COUNT_OFFSET
   i32.add
   i32.const 0
   i32.store
   return
  end
  local.get $base
  global.get $../common/assembly/requiem-entity-reducer/CONTAINER_INSTANCES_PTR_OFFSET
  i32.add
  i32.load
  local.set $instances
  local.get $instances
  global.get $../common/assembly/requiem-entity-reducer/ACTOR_VISIBLE_INDEX_OFFSET
  i32.add
  local.set $writePointer
  i32.const 0
  local.set $visibleCount
  local.get $instances
  global.get $../common/assembly/requiem-entity-reducer/ACTOR_STRIDE_BYTES
  local.get $count
  i32.mul
  i32.add
  local.set $limit
  i32.const 0
  local.set $index
  loop $for-loop|0
   local.get $index
   local.get $count
   i32.lt_u
   if
    block $for-continue|0
     local.get $instances
     global.get $../common/assembly/requiem-entity-reducer/ACTOR_STRIDE_BYTES
     local.get $index
     i32.mul
     i32.add
     local.set $actor
     local.get $actor
     global.get $../common/assembly/requiem-entity-reducer/ACTOR_VISIBLE_INDEX_OFFSET
     i32.add
     i32.const -1
     i32.store
     local.get $actor
     global.get $../common/assembly/requiem-entity-reducer/ACTOR_VISIBLE_FLAG_OFFSET
     i32.add
     i32.const 0
     i32.store
     local.get $actor
     global.get $../common/assembly/requiem-entity-reducer/ACTOR_TRANSLATION_OFFSET
     i32.add
     f32.load
     local.set $x
     local.get $actor
     global.get $../common/assembly/requiem-entity-reducer/ACTOR_TRANSLATION_OFFSET
     i32.add
     i32.const 4
     i32.add
     f32.load
     local.set $y
     local.get $actor
     global.get $../common/assembly/requiem-entity-reducer/ACTOR_TRANSLATION_OFFSET
     i32.add
     i32.const 8
     i32.add
     f32.load
     local.set $z
     local.get $actor
     global.get $../common/assembly/requiem-entity-reducer/ACTOR_TRANSLATION_OFFSET
     i32.add
     i32.const 12
     i32.add
     f32.load
     local.set $scale
     local.get $baseRadius
     local.get $scale
     f32.mul
     local.set $radius
     local.get $maxDistance
     f32.const 0
     f32.gt
     if
      local.get $x
      local.get $cameraX
      f32.sub
      local.set $dx
      local.get $y
      local.get $cameraY
      f32.sub
      local.set $dy
      local.get $z
      local.get $cameraZ
      f32.sub
      local.set $dz
      local.get $maxDistance
      local.get $radius
      f32.add
      local.set $distance
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
      local.get $distance
      local.get $distance
      f32.mul
      f32.gt
      if
       br $for-continue|0
      end
     end
     i32.const 1
     local.set $inside
     i32.const 0
     local.set $plane
     block $for-break1
      loop $for-loop|1
       local.get $plane
       i32.const 6
       i32.lt_u
       if
        local.get $planesPtr
        local.get $plane
        i32.const 16
        i32.mul
        i32.add
        local.set $offset
        local.get $x
        local.get $offset
        f32.load
        f32.mul
        local.get $y
        local.get $offset
        i32.const 4
        i32.add
        f32.load
        f32.mul
        f32.add
        local.get $z
        local.get $offset
        i32.const 8
        i32.add
        f32.load
        f32.mul
        f32.add
        local.get $offset
        i32.const 12
        i32.add
        f32.load
        f32.add
        local.set $distance|26
        local.get $distance|26
        local.get $radius
        f32.neg
        f32.lt
        if
         i32.const 0
         local.set $inside
         br $for-break1
        end
        local.get $plane
        i32.const 1
        i32.add
        local.set $plane
        br $for-loop|1
       end
      end
     end
     local.get $inside
     i32.eqz
     if (result i32)
      i32.const 1
     else
      local.get $writePointer
      local.get $limit
      i32.ge_u
     end
     if
      br $for-continue|0
     end
     local.get $writePointer
     local.get $index
     i32.store
     local.get $writePointer
     global.get $../common/assembly/requiem-entity-reducer/ACTOR_STRIDE_BYTES
     i32.add
     local.set $writePointer
     local.get $visibleCount
     i32.const 1
     i32.add
     local.set $visibleCount
     local.get $actor
     global.get $../common/assembly/requiem-entity-reducer/ACTOR_VISIBLE_FLAG_OFFSET
     i32.add
     i32.const 1
     i32.store
    end
    local.get $index
    i32.const 1
    i32.add
    local.set $index
    br $for-loop|0
   end
  end
  local.get $base
  global.get $../common/assembly/requiem-entity-reducer/CONTAINER_VISIBLE_COUNT_OFFSET
  i32.add
  local.get $visibleCount
  i32.store
 )
 (func $~start
  call $start:../common/assembly/requiem-entity-reducer
 )
)
