(module
 (type $0 (func (param f32) (result f32)))
 (type $1 (func (result i32)))
 (type $2 (func (param i32)))
 (type $3 (func))
 (type $4 (func (param f32 f32) (result f32)))
 (type $5 (func (param i32 f32)))
 (type $6 (func (param i32 i32 i32 f32 f32 f32 f32)))
 (type $7 (func (param i32 f32 f32 f32)))
 (type $8 (func (param i32) (result i32)))
 (type $9 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)))
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
 (global $~lib/math/rempio2f_y (mut f64) (f64.const 0))
 (memory $0 1)
 (data $0 (i32.const 1036) ",")
 (data $0.1 (i32.const 1048) "\02\00\00\00\1c\00\00\00I\00n\00v\00a\00l\00i\00d\00 \00l\00e\00n\00g\00t\00h")
 (data $1 (i32.const 1084) "<")
 (data $1.1 (i32.const 1096) "\02\00\00\00&\00\00\00~\00l\00i\00b\00/\00s\00t\00a\00t\00i\00c\00a\00r\00r\00a\00y\00.\00t\00s")
 (data $2 (i32.const 1148) "<")
 (data $2.1 (i32.const 1160) "\02\00\00\00(\00\00\00A\00l\00l\00o\00c\00a\00t\00i\00o\00n\00 \00t\00o\00o\00 \00l\00a\00r\00g\00e")
 (data $3 (i32.const 1212) "<")
 (data $3.1 (i32.const 1224) "\02\00\00\00\1e\00\00\00~\00l\00i\00b\00/\00r\00t\00/\00s\00t\00u\00b\00.\00t\00s")
 (data $4 (i32.const 1280) ")\15DNn\83\f9\a2\c0\dd4\f5\d1W\'\fcA\90C<\99\95b\dba\c5\bb\de\abcQ\fe")
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
 (func $~lib/math/NativeMathf.atan (param $0 f32) (result f32)
  (local $1 f32)
  (local $2 i32)
  (local $3 i32)
  (local $4 f32)
  (local $5 f32)
  local.get $0
  local.set $1
  local.get $0
  i32.reinterpret_f32
  i32.const 2147483647
  i32.and
  local.tee $2
  i32.const 1283457024
  i32.ge_u
  if
   local.get $0
   local.get $0
   f32.ne
   if
    local.get $0
    return
   end
   f32.const 1.570796251296997
   local.get $1
   f32.copysign
   return
  end
  local.get $2
  i32.const 1054867456
  i32.lt_u
  if
   local.get $2
   i32.const 964689920
   i32.lt_u
   if
    local.get $0
    return
   end
   i32.const -1
   local.set $3
  else
   local.get $0
   f32.abs
   local.set $0
   local.get $2
   i32.const 1066926080
   i32.lt_u
   if (result f32)
    local.get $2
    i32.const 1060110336
    i32.lt_u
    if (result f32)
     local.get $0
     local.get $0
     f32.add
     f32.const -1
     f32.add
     local.get $0
     f32.const 2
     f32.add
     f32.div
    else
     i32.const 1
     local.set $3
     local.get $0
     f32.const -1
     f32.add
     local.get $0
     f32.const 1
     f32.add
     f32.div
    end
   else
    local.get $2
    i32.const 1075576832
    i32.lt_u
    if (result f32)
     i32.const 2
     local.set $3
     local.get $0
     f32.const -1.5
     f32.add
     local.get $0
     f32.const 1.5
     f32.mul
     f32.const 1
     f32.add
     f32.div
    else
     i32.const 3
     local.set $3
     f32.const -1
     local.get $0
     f32.div
    end
   end
   local.set $0
  end
  local.get $0
  local.get $0
  f32.mul
  local.tee $5
  local.get $5
  f32.mul
  local.set $4
  local.get $0
  local.get $5
  local.get $4
  local.get $4
  f32.const 0.06168760731816292
  f32.mul
  f32.const 0.14253635704517365
  f32.add
  f32.mul
  f32.const 0.333333283662796
  f32.add
  f32.mul
  local.get $4
  local.get $4
  f32.const -0.106480173766613
  f32.mul
  f32.const -0.19999158382415771
  f32.add
  f32.mul
  f32.add
  f32.mul
  local.set $4
  local.get $3
  i32.const 0
  i32.lt_s
  if
   local.get $0
   local.get $4
   f32.sub
   return
  end
  block $break|0 (result f32)
   block $case3|0
    block $case2|0
     block $case1|0
      block $case0|0
       block $tablify|0
        local.get $3
        br_table $case0|0 $case1|0 $case2|0 $case3|0 $tablify|0
       end
       unreachable
      end
      f32.const 0.46364760398864746
      local.get $4
      f32.const -5.01215824399992e-09
      f32.add
      local.get $0
      f32.sub
      f32.sub
      br $break|0
     end
     f32.const 0.7853981256484985
     local.get $4
     f32.const -3.774894707930798e-08
     f32.add
     local.get $0
     f32.sub
     f32.sub
     br $break|0
    end
    f32.const 0.9827936887741089
    local.get $4
    f32.const -3.447321716976148e-08
    f32.add
    local.get $0
    f32.sub
    f32.sub
    br $break|0
   end
   f32.const 1.570796251296997
   local.get $4
   f32.const -7.549789415861596e-08
   f32.add
   local.get $0
   f32.sub
   f32.sub
  end
  local.get $1
  f32.copysign
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
  i32.const 2622860
  i32.lt_u
  if
   local.get $0
   i32.const 2688395
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
  i32.const 1324
  i32.const 2621532
  i32.store
  i32.const 1328
  i32.const 0
  i32.store
  i32.const 1332
  i32.const 0
  i32.store
  i32.const 1336
  i32.const 4
  i32.store
  i32.const 1340
  i32.const 2621504
  i32.store
  i32.const 1344
  i32.const 0
  i32.const 2621504
  memory.fill
  i32.const 1344
  global.set $assembly/zone-simulation/arena
 )
 (func $~lib/math/NativeMathf.sin (param $0 f32) (result f32)
  (local $1 f64)
  (local $2 i32)
  (local $3 i64)
  (local $4 i32)
  (local $5 f64)
  (local $6 f64)
  (local $7 i32)
  (local $8 i64)
  (local $9 i64)
  local.get $0
  i32.reinterpret_f32
  local.tee $2
  i32.const 31
  i32.shr_u
  local.set $4
  local.get $2
  i32.const 2147483647
  i32.and
  local.tee $2
  i32.const 1061752794
  i32.le_u
  if
   local.get $2
   i32.const 964689920
   i32.lt_u
   if
    local.get $0
    return
   end
   local.get $0
   f64.promote_f32
   local.tee $5
   local.get $5
   f64.mul
   local.tee $6
   local.get $5
   f64.mul
   local.set $1
   local.get $5
   local.get $1
   local.get $6
   f64.const 0.008333329385889463
   f64.mul
   f64.const -0.16666666641626524
   f64.add
   f64.mul
   f64.add
   local.get $1
   local.get $6
   local.get $6
   f64.mul
   f64.mul
   local.get $6
   f64.const 2.718311493989822e-06
   f64.mul
   f64.const -1.9839334836096632e-04
   f64.add
   f64.mul
   f64.add
   f32.demote_f64
   return
  end
  local.get $2
  i32.const 2139095040
  i32.ge_u
  if
   local.get $0
   local.get $0
   f32.sub
   return
  end
  block $~lib/math/rempio2f|inlined.0 (result i32)
   local.get $2
   i32.const 1305022427
   i32.lt_u
   if
    local.get $0
    f64.promote_f32
    local.get $0
    f64.promote_f32
    f64.const 0.6366197723675814
    f64.mul
    f64.nearest
    local.tee $1
    f64.const 1.5707963109016418
    f64.mul
    f64.sub
    local.get $1
    f64.const 1.5893254773528196e-08
    f64.mul
    f64.sub
    global.set $~lib/math/rempio2f_y
    local.get $1
    i32.trunc_sat_f64_s
    br $~lib/math/rempio2f|inlined.0
   end
   local.get $2
   i32.const 23
   i32.shr_s
   i32.const 152
   i32.sub
   local.tee $7
   i32.const 63
   i32.and
   i64.extend_i32_s
   local.set $8
   local.get $7
   i32.const 6
   i32.shr_s
   i32.const 3
   i32.shl
   i32.const 1280
   i32.add
   local.tee $7
   i64.load offset=8
   local.set $3
   f64.const 8.515303950216386e-20
   local.get $0
   f64.promote_f32
   f64.copysign
   local.get $2
   i32.const 8388607
   i32.and
   i32.const 8388608
   i32.or
   i64.extend_i32_s
   local.tee $9
   local.get $7
   i64.load
   local.get $8
   i64.shl
   local.get $3
   i64.const 64
   local.get $8
   i64.sub
   i64.shr_u
   i64.or
   i64.mul
   local.get $8
   i64.const 32
   i64.gt_u
   if (result i64)
    local.get $3
    local.get $8
    i64.const 32
    i64.sub
    i64.shl
    local.get $7
    i64.load offset=16
    i64.const 96
    local.get $8
    i64.sub
    i64.shr_u
    i64.or
   else
    local.get $3
    i64.const 32
    local.get $8
    i64.sub
    i64.shr_u
   end
   local.get $9
   i64.mul
   i64.const 32
   i64.shr_u
   i64.add
   local.tee $3
   i64.const 2
   i64.shl
   local.tee $8
   f64.convert_i64_s
   f64.mul
   global.set $~lib/math/rempio2f_y
   i32.const 0
   local.get $3
   i64.const 62
   i64.shr_u
   local.get $8
   i64.const 63
   i64.shr_u
   i64.add
   i32.wrap_i64
   local.tee $2
   i32.sub
   local.get $2
   local.get $4
   select
  end
  local.set $2
  global.get $~lib/math/rempio2f_y
  local.set $1
  local.get $2
  i32.const 1
  i32.and
  if (result f32)
   local.get $1
   local.get $1
   f64.mul
   local.tee $1
   local.get $1
   f64.mul
   local.set $5
   local.get $1
   f64.const -0.499999997251031
   f64.mul
   f64.const 1
   f64.add
   local.get $5
   f64.const 0.04166662332373906
   f64.mul
   f64.add
   local.get $5
   local.get $1
   f64.mul
   local.get $1
   f64.const 2.439044879627741e-05
   f64.mul
   f64.const -0.001388676377460993
   f64.add
   f64.mul
   f64.add
   f32.demote_f64
  else
   local.get $1
   local.get $1
   local.get $1
   f64.mul
   local.tee $5
   local.get $1
   f64.mul
   local.tee $1
   local.get $5
   f64.const 0.008333329385889463
   f64.mul
   f64.const -0.16666666641626524
   f64.add
   f64.mul
   f64.add
   local.get $1
   local.get $5
   local.get $5
   f64.mul
   f64.mul
   local.get $5
   f64.const 2.718311493989822e-06
   f64.mul
   f64.const -1.9839334836096632e-04
   f64.add
   f64.mul
   f64.add
   f32.demote_f64
  end
  local.tee $0
  f32.neg
  local.get $0
  local.get $2
  i32.const 2
  i32.and
  select
 )
 (func $~lib/math/NativeMathf.cos (param $0 f32) (result f32)
  (local $1 f64)
  (local $2 i32)
  (local $3 i64)
  (local $4 i32)
  (local $5 f64)
  (local $6 i32)
  (local $7 i64)
  (local $8 i64)
  local.get $0
  i32.reinterpret_f32
  local.tee $2
  i32.const 31
  i32.shr_u
  local.set $4
  local.get $2
  i32.const 2147483647
  i32.and
  local.tee $2
  i32.const 1061752794
  i32.le_u
  if
   local.get $2
   i32.const 964689920
   i32.lt_u
   if
    f32.const 1
    return
   end
   local.get $0
   f64.promote_f32
   local.tee $1
   local.get $1
   f64.mul
   local.tee $1
   local.get $1
   f64.mul
   local.set $5
   local.get $1
   f64.const -0.499999997251031
   f64.mul
   f64.const 1
   f64.add
   local.get $5
   f64.const 0.04166662332373906
   f64.mul
   f64.add
   local.get $5
   local.get $1
   f64.mul
   local.get $1
   f64.const 2.439044879627741e-05
   f64.mul
   f64.const -0.001388676377460993
   f64.add
   f64.mul
   f64.add
   f32.demote_f64
   return
  end
  local.get $2
  i32.const 2139095040
  i32.ge_u
  if
   local.get $0
   local.get $0
   f32.sub
   return
  end
  block $~lib/math/rempio2f|inlined.1 (result i32)
   local.get $2
   i32.const 1305022427
   i32.lt_u
   if
    local.get $0
    f64.promote_f32
    local.get $0
    f64.promote_f32
    f64.const 0.6366197723675814
    f64.mul
    f64.nearest
    local.tee $1
    f64.const 1.5707963109016418
    f64.mul
    f64.sub
    local.get $1
    f64.const 1.5893254773528196e-08
    f64.mul
    f64.sub
    global.set $~lib/math/rempio2f_y
    local.get $1
    i32.trunc_sat_f64_s
    br $~lib/math/rempio2f|inlined.1
   end
   local.get $2
   i32.const 23
   i32.shr_s
   i32.const 152
   i32.sub
   local.tee $6
   i32.const 63
   i32.and
   i64.extend_i32_s
   local.set $7
   local.get $6
   i32.const 6
   i32.shr_s
   i32.const 3
   i32.shl
   i32.const 1280
   i32.add
   local.tee $6
   i64.load offset=8
   local.set $3
   f64.const 8.515303950216386e-20
   local.get $0
   f64.promote_f32
   f64.copysign
   local.get $2
   i32.const 8388607
   i32.and
   i32.const 8388608
   i32.or
   i64.extend_i32_s
   local.tee $8
   local.get $6
   i64.load
   local.get $7
   i64.shl
   local.get $3
   i64.const 64
   local.get $7
   i64.sub
   i64.shr_u
   i64.or
   i64.mul
   local.get $7
   i64.const 32
   i64.gt_u
   if (result i64)
    local.get $3
    local.get $7
    i64.const 32
    i64.sub
    i64.shl
    local.get $6
    i64.load offset=16
    i64.const 96
    local.get $7
    i64.sub
    i64.shr_u
    i64.or
   else
    local.get $3
    i64.const 32
    local.get $7
    i64.sub
    i64.shr_u
   end
   local.get $8
   i64.mul
   i64.const 32
   i64.shr_u
   i64.add
   local.tee $3
   i64.const 2
   i64.shl
   local.tee $7
   f64.convert_i64_s
   f64.mul
   global.set $~lib/math/rempio2f_y
   i32.const 0
   local.get $3
   i64.const 62
   i64.shr_u
   local.get $7
   i64.const 63
   i64.shr_u
   i64.add
   i32.wrap_i64
   local.tee $2
   i32.sub
   local.get $2
   local.get $4
   select
  end
  local.set $2
  global.get $~lib/math/rempio2f_y
  local.set $1
  local.get $2
  i32.const 1
  i32.and
  if (result f32)
   local.get $1
   local.get $1
   local.get $1
   f64.mul
   local.tee $5
   local.get $1
   f64.mul
   local.tee $1
   local.get $5
   f64.const 0.008333329385889463
   f64.mul
   f64.const -0.16666666641626524
   f64.add
   f64.mul
   f64.add
   local.get $1
   local.get $5
   local.get $5
   f64.mul
   f64.mul
   local.get $5
   f64.const 2.718311493989822e-06
   f64.mul
   f64.const -1.9839334836096632e-04
   f64.add
   f64.mul
   f64.add
   f32.demote_f64
  else
   local.get $1
   local.get $1
   f64.mul
   local.tee $1
   local.get $1
   f64.mul
   local.set $5
   local.get $1
   f64.const -0.499999997251031
   f64.mul
   f64.const 1
   f64.add
   local.get $5
   f64.const 0.04166662332373906
   f64.mul
   f64.add
   local.get $5
   local.get $1
   f64.mul
   local.get $1
   f64.const 2.439044879627741e-05
   f64.mul
   f64.const -0.001388676377460993
   f64.add
   f64.mul
   f64.add
   f32.demote_f64
  end
  local.tee $0
  f32.neg
  local.get $0
  local.get $2
  i32.const 1
  i32.add
  i32.const 2
  i32.and
  select
 )
 (func $~lib/math/NativeMathf.atan2 (param $0 f32) (param $1 f32) (result f32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  local.get $0
  local.get $0
  f32.ne
  local.get $1
  local.get $1
  f32.ne
  i32.or
  if
   local.get $1
   local.get $0
   f32.add
   return
  end
  local.get $1
  i32.reinterpret_f32
  local.tee $3
  i32.const 1065353216
  i32.eq
  if
   local.get $0
   call $~lib/math/NativeMathf.atan
   return
  end
  local.get $3
  i32.const 30
  i32.shr_u
  i32.const 2
  i32.and
  local.get $0
  i32.reinterpret_f32
  local.tee $4
  i32.const 31
  i32.shr_u
  i32.or
  local.set $2
  local.get $4
  i32.const 2147483647
  i32.and
  local.tee $4
  i32.eqz
  if
   block $break|0
    block $case3|0
     block $case2|0
      local.get $2
      i32.eqz
      local.get $2
      i32.const 1
      i32.eq
      i32.or
      i32.eqz
      if
       local.get $2
       i32.const 2
       i32.eq
       br_if $case2|0
       local.get $2
       i32.const 3
       i32.eq
       br_if $case3|0
       br $break|0
      end
      local.get $0
      return
     end
     f32.const 3.1415927410125732
     return
    end
    f32.const -3.1415927410125732
    return
   end
  end
  block $folding-inner0
   local.get $3
   i32.const 2147483647
   i32.and
   local.tee $3
   i32.eqz
   br_if $folding-inner0
   local.get $3
   i32.const 2139095040
   i32.eq
   if
    local.get $4
    i32.const 2139095040
    i32.eq
    if (result f32)
     f32.const 2.356194496154785
     f32.const 0.7853981852531433
     local.get $2
     i32.const 2
     i32.and
     select
     local.tee $0
     f32.neg
     local.get $0
     local.get $2
     i32.const 1
     i32.and
     select
    else
     f32.const 3.1415927410125732
     f32.const 0
     local.get $2
     i32.const 2
     i32.and
     select
     local.tee $0
     f32.neg
     local.get $0
     local.get $2
     i32.const 1
     i32.and
     select
    end
    return
   end
   local.get $4
   i32.const 2139095040
   i32.eq
   local.get $3
   i32.const 218103808
   i32.add
   local.get $4
   i32.lt_u
   i32.or
   br_if $folding-inner0
   local.get $4
   i32.const 218103808
   i32.add
   local.get $3
   i32.lt_u
   i32.const 0
   local.get $2
   i32.const 2
   i32.and
   select
   if (result f32)
    f32.const 0
   else
    local.get $0
    local.get $1
    f32.div
    f32.abs
    call $~lib/math/NativeMathf.atan
   end
   local.set $0
   block $break|1
    block $case3|1
     block $case2|1
      block $case1|1
       block $case0|1
        local.get $2
        br_table $case0|1 $case1|1 $case2|1 $case3|1 $break|1
       end
       local.get $0
       return
      end
      local.get $0
      f32.neg
      return
     end
     f32.const 3.1415927410125732
     local.get $0
     f32.const 8.742277657347586e-08
     f32.add
     f32.sub
     return
    end
    local.get $0
    f32.const 8.742277657347586e-08
    f32.add
    f32.const -3.1415927410125732
    f32.add
    return
   end
   unreachable
  end
  f32.const -1.5707963705062866
  f32.const 1.5707963705062866
  local.get $2
  i32.const 1
  i32.and
  select
 )
 (func $assembly/zone-simulation/tickNpcs (param $0 i32) (param $1 f32)
  (local $2 i32)
  (local $3 f32)
  (local $4 i32)
  (local $5 i32)
  (local $6 f32)
  (local $7 f32)
  (local $8 f32)
  (local $9 i32)
  (local $10 i32)
  (local $11 f32)
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
  local.tee $1
  f32.const 0
  f32.le
  if
   return
  end
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
     local.tee $4
     global.get $assembly/zone-simulation/targetX
     i32.add
     f32.load
     local.get $2
     i32.const 12
     i32.mul
     local.tee $5
     global.get $assembly/zone-simulation/positionX
     i32.add
     f32.load
     f32.sub
     local.tee $3
     local.get $3
     f32.mul
     global.get $assembly/zone-simulation/targetY
     local.get $4
     i32.add
     f32.load
     global.get $assembly/zone-simulation/positionY
     local.get $5
     i32.add
     f32.load
     f32.sub
     local.tee $6
     local.get $6
     f32.mul
     f32.add
     global.get $assembly/zone-simulation/targetZ
     local.get $4
     i32.add
     f32.load
     global.get $assembly/zone-simulation/positionZ
     local.get $5
     i32.add
     f32.load
     f32.sub
     local.tee $7
     local.get $7
     f32.mul
     f32.add
     local.tee $8
     f32.const 9.999999747378752e-05
     f32.lt
     if
      global.get $assembly/zone-simulation/movementState
      local.get $2
      i32.const 1
      i32.shl
      i32.add
      local.tee $9
      i32.load16_u
      i32.const 0
      i32.ne
      global.get $assembly/zone-simulation/velocityX
      local.get $5
      i32.add
      f32.const 0
      f32.store
      global.get $assembly/zone-simulation/velocityY
      local.get $5
      i32.add
      f32.const 0
      f32.store
      global.get $assembly/zone-simulation/velocityZ
      local.get $5
      i32.add
      f32.const 0
      f32.store
      global.get $assembly/zone-simulation/animation
      local.get $4
      i32.add
      i32.const 0
      i32.store
      local.get $9
      i32.const 0
      i32.store16
      if
       local.get $2
       call $assembly/zone-simulation/markDirty
      end
      br $for-continue|0
     end
     global.get $assembly/zone-simulation/speed
     local.get $4
     i32.add
     f32.load
     local.tee $11
     f32.const 0
     f32.le
     if
      global.get $assembly/zone-simulation/movementState
      local.get $2
      i32.const 1
      i32.shl
      i32.add
      local.tee $9
      i32.load16_u
      i32.const 0
      i32.ne
      global.get $assembly/zone-simulation/velocityX
      local.get $5
      i32.add
      f32.const 0
      f32.store
      global.get $assembly/zone-simulation/velocityY
      local.get $5
      i32.add
      f32.const 0
      f32.store
      global.get $assembly/zone-simulation/velocityZ
      local.get $5
      i32.add
      f32.const 0
      f32.store
      global.get $assembly/zone-simulation/animation
      local.get $4
      i32.add
      i32.const 0
      i32.store
      local.get $9
      i32.const 0
      i32.store16
      if
       local.get $2
       call $assembly/zone-simulation/markDirty
      end
      br $for-continue|0
     end
     global.get $assembly/zone-simulation/velocityX
     local.get $5
     i32.add
     local.get $3
     f32.const 1
     local.get $8
     f32.sqrt
     f32.div
     local.tee $8
     f32.mul
     local.tee $3
     local.get $11
     f32.mul
     f32.store
     global.get $assembly/zone-simulation/velocityY
     local.get $5
     i32.add
     local.get $6
     local.get $8
     f32.mul
     local.tee $6
     local.get $11
     f32.mul
     f32.store
     global.get $assembly/zone-simulation/velocityZ
     local.get $5
     i32.add
     local.get $7
     local.get $8
     f32.mul
     local.tee $12
     local.get $11
     f32.mul
     f32.store
     global.get $assembly/zone-simulation/positionX
     local.get $5
     i32.add
     local.tee $9
     local.get $9
     f32.load
     local.get $3
     local.get $11
     local.get $1
     f32.mul
     f32.const 1
     local.get $8
     f32.div
     f32.min
     local.tee $11
     f32.mul
     f32.add
     f32.store
     global.get $assembly/zone-simulation/positionY
     local.get $5
     i32.add
     local.tee $9
     local.get $9
     f32.load
     local.get $6
     local.get $11
     f32.mul
     f32.add
     f32.store
     global.get $assembly/zone-simulation/positionZ
     local.get $5
     i32.add
     local.tee $5
     local.get $5
     f32.load
     local.get $12
     local.get $11
     f32.mul
     f32.add
     f32.store
     local.get $7
     f32.neg
     local.get $8
     f32.mul
     local.get $3
     call $~lib/math/NativeMathf.atan2
     local.tee $3
     f32.const 0.5
     f32.mul
     local.set $6
     global.get $assembly/zone-simulation/heading
     local.get $4
     i32.add
     local.get $3
     f32.store
     local.get $2
     i32.const 4
     i32.shl
     local.tee $5
     global.get $assembly/zone-simulation/orientationX
     i32.add
     f32.const 0
     f32.store
     global.get $assembly/zone-simulation/orientationY
     local.get $5
     i32.add
     local.get $6
     call $~lib/math/NativeMathf.sin
     f32.store
     global.get $assembly/zone-simulation/orientationZ
     local.get $5
     i32.add
     f32.const 0
     f32.store
     global.get $assembly/zone-simulation/orientationW
     local.get $5
     i32.add
     local.get $6
     call $~lib/math/NativeMathf.cos
     f32.store
     global.get $assembly/zone-simulation/animation
     local.get $4
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
 (func $assembly/zone-simulation/bindEntityArena (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 i32) (param $5 i32) (param $6 i32) (param $7 i32) (param $8 i32) (param $9 i32) (param $10 i32) (param $11 i32) (param $12 i32) (param $13 i32) (param $14 i32) (param $15 i32) (param $16 i32) (param $17 i32) (param $18 i32) (param $19 i32) (param $20 i32)
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
  global.set $assembly/zone-simulation/orientationX
  local.get $6
  global.set $assembly/zone-simulation/orientationY
  local.get $7
  global.set $assembly/zone-simulation/orientationZ
  local.get $8
  global.set $assembly/zone-simulation/orientationW
  local.get $9
  global.set $assembly/zone-simulation/velocityX
  local.get $10
  global.set $assembly/zone-simulation/velocityY
  local.get $11
  global.set $assembly/zone-simulation/velocityZ
  local.get $12
  global.set $assembly/zone-simulation/animation
  local.get $13
  global.set $assembly/zone-simulation/movementState
  local.get $14
  global.set $assembly/zone-simulation/heading
  local.get $15
  global.set $assembly/zone-simulation/targetX
  local.get $16
  global.set $assembly/zone-simulation/targetY
  local.get $17
  global.set $assembly/zone-simulation/targetZ
  local.get $18
  global.set $assembly/zone-simulation/speed
  local.get $19
  global.set $assembly/zone-simulation/dirtyFlags
  local.get $20
  global.set $assembly/zone-simulation/dirtyIndices
 )
 (func $assembly/zone-simulation/arenaPtr (result i32)
  global.get $assembly/zone-simulation/arena
 )
 (func $assembly/zone-simulation/arenaByteLength (result i32)
  i32.const 2621504
 )
)
