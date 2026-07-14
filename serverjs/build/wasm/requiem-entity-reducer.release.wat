(module
 (type $0 (func))
 (type $1 (func (param i32 i32 f32 f32 f32 f32 f32)))
 (type $2 (func (param i32) (result i32)))
 (global $../common/assembly/requiem-entity-reducer/heap (mut i32) (i32.const 0))
 (memory $0 0)
 (export "alloc" (func $../common/assembly/requiem-entity-reducer/alloc))
 (export "frustumMarkAoS" (func $../common/assembly/requiem-entity-reducer/frustumMarkAoS))
 (export "memory" (memory $0))
 (start $~start)
 (func $~start
  memory.size
  i32.const 16
  i32.shl
  global.set $../common/assembly/requiem-entity-reducer/heap
 )
 (func $../common/assembly/requiem-entity-reducer/frustumMarkAoS (param $0 i32) (param $1 i32) (param $2 f32) (param $3 f32) (param $4 f32) (param $5 f32) (param $6 f32)
  (local $7 i32)
  (local $8 i32)
  (local $9 i32)
  (local $10 i32)
  (local $11 i32)
  (local $12 i32)
  (local $13 i32)
  (local $14 f32)
  (local $15 f32)
  (local $16 f32)
  (local $17 f32)
  (local $18 i32)
  (local $19 i32)
  (local $20 i32)
  (local $21 f32)
  local.get $0
  i32.load offset=8
  local.tee $12
  i32.eqz
  if
   local.get $0
   i32.const 0
   i32.store
   return
  end
  local.get $0
  i32.load offset=4
  local.tee $13
  i32.const 48
  i32.add
  local.set $8
  local.get $13
  local.get $12
  i32.const 7
  i32.shl
  i32.add
  local.set $20
  loop $for-loop|0
   local.get $9
   local.get $12
   i32.lt_u
   if
    local.get $13
    local.get $9
    i32.const 7
    i32.shl
    i32.add
    local.tee $7
    i32.const -1
    i32.store offset=48
    local.get $7
    i32.const 0
    i32.store offset=96
    local.get $7
    f32.load
    local.set $14
    local.get $7
    f32.load offset=4
    local.set $15
    local.get $7
    f32.load offset=8
    local.set $16
    local.get $2
    local.get $7
    f32.load offset=12
    f32.mul
    local.set $17
    block $for-continue|0
     local.get $6
     f32.const 0
     f32.gt
     if
      local.get $14
      local.get $3
      f32.sub
      local.tee $21
      local.get $21
      f32.mul
      local.get $15
      local.get $4
      f32.sub
      local.tee $21
      local.get $21
      f32.mul
      f32.add
      local.get $16
      local.get $5
      f32.sub
      local.tee $21
      local.get $21
      f32.mul
      f32.add
      local.get $6
      local.get $17
      f32.add
      local.tee $21
      local.get $21
      f32.mul
      f32.gt
      br_if $for-continue|0
     end
     i32.const 1
     local.set $18
     i32.const 0
     local.set $10
     loop $for-loop|1
      local.get $10
      i32.const 6
      i32.lt_u
      if
       block $for-break1
        local.get $17
        f32.neg
        local.get $14
        local.get $1
        local.get $10
        i32.const 4
        i32.shl
        i32.add
        local.tee $11
        f32.load
        f32.mul
        local.get $15
        local.get $11
        f32.load offset=4
        f32.mul
        f32.add
        local.get $16
        local.get $11
        f32.load offset=8
        f32.mul
        f32.add
        local.get $11
        f32.load offset=12
        f32.add
        f32.gt
        if
         i32.const 0
         local.set $18
         br $for-break1
        end
        local.get $10
        i32.const 1
        i32.add
        local.set $10
        br $for-loop|1
       end
      end
     end
     local.get $18
     i32.eqz
     local.get $8
     local.get $20
     i32.ge_u
     i32.or
     br_if $for-continue|0
     local.get $8
     local.get $9
     i32.store
     local.get $8
     i32.const 128
     i32.add
     local.set $8
     local.get $19
     i32.const 1
     i32.add
     local.set $19
     local.get $7
     i32.const 1
     i32.store offset=96
    end
    local.get $9
    i32.const 1
    i32.add
    local.set $9
    br $for-loop|0
   end
  end
  local.get $0
  local.get $19
  i32.store
 )
 (func $../common/assembly/requiem-entity-reducer/alloc (param $0 i32) (result i32)
  (local $1 i32)
  (local $2 i32)
  (local $3 i32)
  global.get $../common/assembly/requiem-entity-reducer/heap
  local.tee $1
  local.get $0
  i32.add
  local.tee $2
  i32.const 65535
  i32.add
  i32.const 16
  i32.shr_u
  local.tee $3
  memory.size
  local.tee $0
  i32.gt_s
  if
   local.get $3
   local.get $0
   i32.sub
   memory.grow
   drop
  end
  local.get $2
  global.set $../common/assembly/requiem-entity-reducer/heap
  local.get $1
 )
)
