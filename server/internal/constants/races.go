package constants

// Auto-generated constants from EQEmu RACES_H

// Gender constants
type Gender uint8

const (
	Gender_Male Gender = iota
	Gender_Female
	Gender_Neuter
)

type PlayerRace uint32

// Player race values
const (
	PlayerRaceUnknown PlayerRace = iota
	PlayerRaceHuman
	PlayerRaceBarbarian
	PlayerRaceErudite
	PlayerRaceWoodElf
	PlayerRaceHighElf
	PlayerRaceDarkElf
	PlayerRaceHalfElf
	PlayerRaceDwarf
	PlayerRaceTroll
	PlayerRaceOgre
	PlayerRaceHalfling
	PlayerRaceGnome
	PlayerRaceIksar
	PlayerRaceVahshir
	PlayerRaceFroglok
	PlayerRaceDrakkin
	PlayerRaceCount
	PlayerRaceEmuNPC
	PlayerRaceEmuPet
	PlayerRaceEmuCount
)

// Player race bitmasks
const (
	PlayerRaceUnknownBit   uint32 = 0
	PlayerRaceHumanBit     uint32 = 1
	PlayerRaceBarbarianBit uint32 = 2
	PlayerRaceEruditeBit   uint32 = 4
	PlayerRaceWoodElfBit   uint32 = 8
	PlayerRaceHighElfBit   uint32 = 16
	PlayerRaceDarkElfBit   uint32 = 32
	PlayerRaceHalfElfBit   uint32 = 64
	PlayerRaceDwarfBit     uint32 = 128
	PlayerRaceTrollBit     uint32 = 256
	PlayerRaceOgreBit      uint32 = 512
	PlayerRaceHalflingBit  uint32 = 1024
	PlayerRaceGnomeBit     uint32 = 2048
	PlayerRaceIksarBit     uint32 = 4096
	PlayerRaceVahshirBit   uint32 = 8192
	PlayerRaceFroglokBit   uint32 = 16384
	PlayerRaceDrakkinBit   uint32 = 32768
	PlayerRaceAllMask      uint32 = 65535
)

type RaceID uint16

const (
	RaceDoug                  RaceID = 0
	RaceHuman                 RaceID = 1
	RaceBarbarian             RaceID = 2
	RaceErudite               RaceID = 3
	RaceWoodElf               RaceID = 4
	RaceHighElf               RaceID = 5
	RaceDarkElf               RaceID = 6
	RaceHalfElf               RaceID = 7
	RaceDwarf                 RaceID = 8
	RaceTroll                 RaceID = 9
	RaceOgre                  RaceID = 10
	RaceHalfling              RaceID = 11
	RaceGnome                 RaceID = 12
	RaceAviak                 RaceID = 13
	RaceWerewolf              RaceID = 14
	RaceBrownie               RaceID = 15
	RaceCentaur               RaceID = 16
	RaceGolem                 RaceID = 17
	RaceGiant                 RaceID = 18
	RaceTrakanon              RaceID = 19
	RaceVenrilSathir          RaceID = 20
	RaceEvilEye               RaceID = 21
	RaceBeetle                RaceID = 22
	RaceKerran                RaceID = 23
	RaceFish                  RaceID = 24
	RaceFairy                 RaceID = 25
	RaceFroglok               RaceID = 26
	RaceFroglokGhoul          RaceID = 27
	RaceFungusman             RaceID = 28
	RaceGargoyle              RaceID = 29
	RaceGasbag                RaceID = 30
	RaceGelatinousCube        RaceID = 31
	RaceGhost                 RaceID = 32
	RaceGhoul                 RaceID = 33
	RaceGiantBat              RaceID = 34
	RaceGiantEel              RaceID = 35
	RaceGiantRat              RaceID = 36
	RaceGiantSnake            RaceID = 37
	RaceGiantSpider           RaceID = 38
	RaceGnoll                 RaceID = 39
	RaceGoblin                RaceID = 40
	RaceGorilla               RaceID = 41
	RaceWolf                  RaceID = 42
	RaceBear                  RaceID = 43
	RaceFreeportGuard         RaceID = 44
	RaceDemiLich              RaceID = 45
	RaceImp                   RaceID = 46
	RaceGriffin               RaceID = 47
	RaceKobold                RaceID = 48
	RaceLavaDragon            RaceID = 49
	RaceLion                  RaceID = 50
	RaceLizardMan             RaceID = 51
	RaceMimic                 RaceID = 52
	RaceMinotaur              RaceID = 53
	RaceOrc                   RaceID = 54
	RaceHumanBeggar           RaceID = 55
	RacePixie                 RaceID = 56
	RaceDrachnid              RaceID = 57
	RaceSolusekRo             RaceID = 58
	RaceBloodgill             RaceID = 59
	RaceSkeleton4             RaceID = 60
	RaceShark                 RaceID = 61
	RaceTunare                RaceID = 62
	RaceTiger2                RaceID = 63
	RaceTreant                RaceID = 64
	RaceVampire               RaceID = 65
	RaceStatueOfRallosZek     RaceID = 66
	RaceHighpassCitizen       RaceID = 67
	RaceTentacleTerror        RaceID = 68
	RaceWisp                  RaceID = 69
	RaceZombie                RaceID = 70
	RaceQeynosCitizen         RaceID = 71
	RaceShip                  RaceID = 72
	RaceLaunch                RaceID = 73
	RacePiranha               RaceID = 74
	RaceElemental2            RaceID = 75
	RacePuma                  RaceID = 76
	RaceNeriakCitizen         RaceID = 77
	RaceEruditeCitizen        RaceID = 78
	RaceBixie                 RaceID = 79
	RaceReanimatedHand        RaceID = 80
	RaceRivervaleCitizen      RaceID = 81
	RaceScarecrow             RaceID = 82
	RaceSkunk                 RaceID = 83
	RaceSnakeElemental        RaceID = 84
	RaceSpectre               RaceID = 85
	RaceSphinx                RaceID = 86
	RaceArmadillo             RaceID = 87
	RaceClockworkGnome        RaceID = 88
	RaceDrake                 RaceID = 89
	RaceHalasCitizen          RaceID = 90
	RaceAlligator3            RaceID = 91
	RaceGrobbCitizen          RaceID = 92
	RaceOggokCitizen2         RaceID = 93
	RaceKaladimCitizen        RaceID = 94
	RaceCazicThule            RaceID = 95
	RaceCockatrice            RaceID = 96
	RaceDaisyMan              RaceID = 97
	RaceElfVampire            RaceID = 98
	RaceDenizen               RaceID = 99
	RaceDervish               RaceID = 100
	RaceEfreeti               RaceID = 101
	RaceFroglokTadpole        RaceID = 102
	RacePhinigelAutropos      RaceID = 103
	RaceLeech                 RaceID = 104
	RaceSwordfish             RaceID = 105
	RaceFelguard              RaceID = 106
	RaceMammoth               RaceID = 107
	RaceEyeOfZomm2            RaceID = 108
	RaceWasp                  RaceID = 109
	RaceMermaid               RaceID = 110
	RaceHarpy                 RaceID = 111
	RaceFayguard              RaceID = 112
	RaceDrixie                RaceID = 113
	RaceGhostShip             RaceID = 114
	RaceClam                  RaceID = 115
	RaceSeaHorse              RaceID = 116
	RaceDwarfGhost            RaceID = 117
	RaceEruditeGhost          RaceID = 118
	RaceSabertooth            RaceID = 119
	RaceWolfElemental2        RaceID = 120
	RaceGorgon                RaceID = 121
	RaceDragonSkeleton        RaceID = 122
	RaceInnoruuk              RaceID = 123
	RaceUnicorn               RaceID = 124
	RacePegasus               RaceID = 125
	RaceDjinn                 RaceID = 126
	RaceInvisibleMan          RaceID = 127
	RaceIksar                 RaceID = 128
	RaceScorpion              RaceID = 129
	RaceVahShir               RaceID = 130
	RaceSarnak                RaceID = 131
	RaceDraglock              RaceID = 132
	RaceDrolvarg              RaceID = 133
	RaceMosquito              RaceID = 134
	RaceRhinoceros            RaceID = 135
	RaceXalgoz                RaceID = 136
	RaceKunarkGoblin          RaceID = 137
	RaceYeti                  RaceID = 138
	RaceIksarCitizen          RaceID = 139
	RaceForestGiant           RaceID = 140
	RaceBoat                  RaceID = 141
	RaceMinorIllusion         RaceID = 142
	RaceTree                  RaceID = 143
	RaceBurynai               RaceID = 144
	RaceGoo                   RaceID = 145
	RaceSarnakSpirit          RaceID = 146
	RaceIksarSpirit           RaceID = 147
	RaceKunarkFish            RaceID = 148
	RaceIksarScorpion         RaceID = 149
	RaceErollisi              RaceID = 150
	RaceTribunal              RaceID = 151
	RaceBertoxxulous          RaceID = 152
	RaceBristlebane           RaceID = 153
	RaceFayDrake              RaceID = 154
	RaceUndeadSarnak          RaceID = 155
	RaceRatman                RaceID = 156
	RaceWyvern                RaceID = 157
	RaceWurm                  RaceID = 158
	RaceDevourer              RaceID = 159
	RaceIksarGolem            RaceID = 160
	RaceUndeadIksar           RaceID = 161
	RaceManEatingPlant        RaceID = 162
	RaceRaptor                RaceID = 163
	RaceSarnakGolem           RaceID = 164
	RaceWaterDragon           RaceID = 165
	RaceAnimatedHand          RaceID = 166
	RaceSucculent             RaceID = 167
	RaceHolgresh              RaceID = 168
	RaceBrontotherium         RaceID = 169
	RaceSnowDervish           RaceID = 170
	RaceDireWolf              RaceID = 171
	RaceManticore             RaceID = 172
	RaceTotem                 RaceID = 173
	RaceIceSpectre            RaceID = 174
	RaceEnchantedArmor        RaceID = 175
	RaceSnowRabbit            RaceID = 176
	RaceWalrus                RaceID = 177
	RaceGeonid                RaceID = 178
	RaceUnknown               RaceID = 179
	RaceUnknown2              RaceID = 180
	RaceYakkar                RaceID = 181
	RaceFaun                  RaceID = 182
	RaceColdain               RaceID = 183
	RaceVeliousDragon         RaceID = 184
	RaceHag                   RaceID = 185
	RaceHippogriff            RaceID = 186
	RaceSiren                 RaceID = 187
	RaceFrostGiant            RaceID = 188
	RaceStormGiant            RaceID = 189
	RaceOthmir                RaceID = 190
	RaceUlthork               RaceID = 191
	RaceClockworkDragon       RaceID = 192
	RaceAbhorrent             RaceID = 193
	RaceSeaTurtle             RaceID = 194
	RaceBlackAndWhiteDragon   RaceID = 195
	RaceGhostDragon           RaceID = 196
	RaceRonnieTest            RaceID = 197
	RacePrismaticDragon       RaceID = 198
	RaceShiknar               RaceID = 199
	RaceRockhopper            RaceID = 200
	RaceUnderbulk             RaceID = 201
	RaceGrimling              RaceID = 202
	RaceWorm                  RaceID = 203
	RaceEvanTest              RaceID = 204
	RaceKhatiSha              RaceID = 205
	RaceOwlbear               RaceID = 206
	RaceRhinoBeetle           RaceID = 207
	RaceVampire2              RaceID = 208
	RaceEarthElemental        RaceID = 209
	RaceAirElemental          RaceID = 210
	RaceWaterElemental        RaceID = 211
	RaceFireElemental         RaceID = 212
	RaceWetfangMinnow         RaceID = 213
	RaceThoughtHorror         RaceID = 214
	RaceTegi                  RaceID = 215
	RaceHorse                 RaceID = 216
	RaceShissar               RaceID = 217
	RaceFungalFiend           RaceID = 218
	RaceVampireVolatalis      RaceID = 219
	RaceStonegrabber          RaceID = 220
	RaceScarletCheetah        RaceID = 221
	RaceZelniak               RaceID = 222
	RaceLightcrawler          RaceID = 223
	RaceShade                 RaceID = 224
	RaceSunflower             RaceID = 225
	RaceShadel                RaceID = 226
	RaceShrieker              RaceID = 227
	RaceGalorian              RaceID = 228
	RaceNetherbian            RaceID = 229
	RaceAkhevan               RaceID = 230
	RaceGriegVeneficus        RaceID = 231
	RaceSonicWolf             RaceID = 232
	RaceGroundShaker          RaceID = 233
	RaceVahShirSkeleton       RaceID = 234
	RaceWretch                RaceID = 235
	RaceLordInquisitorSeru    RaceID = 236
	RaceRecuso                RaceID = 237
	RaceVahShirKing           RaceID = 238
	RaceVahShirGuard          RaceID = 239
	RaceTeleportMan           RaceID = 240
	RaceWerewolf2             RaceID = 241
	RaceNymph                 RaceID = 242
	RaceDryad                 RaceID = 243
	RaceTreant2               RaceID = 244
	RaceFly                   RaceID = 245
	RaceTarewMarr             RaceID = 246
	RaceSolusekRo2            RaceID = 247
	RaceClockworkGolem        RaceID = 248
	RaceClockworkBrain        RaceID = 249
	RaceBanshee               RaceID = 250
	RaceGuardOfJustice        RaceID = 251
	RaceMiniPom               RaceID = 252
	RaceDiseasedFiend         RaceID = 253
	RaceSolusekRoGuard        RaceID = 254
	RaceBertoxxulousNew       RaceID = 255
	RaceTribunalNew           RaceID = 256
	RaceTerrisThule           RaceID = 257
	RaceVegerog               RaceID = 258
	RaceCrocodile             RaceID = 259
	RaceBat                   RaceID = 260
	RaceHraquis               RaceID = 261
	RaceTranquilion           RaceID = 262
	RaceTinSoldier            RaceID = 263
	RaceNightmareWraith       RaceID = 264
	RaceMalarian              RaceID = 265
	RaceKnightOfPestilence    RaceID = 266
	RaceLepertoloth           RaceID = 267
	RaceBubonian              RaceID = 268
	RaceBubonianUnderling     RaceID = 269
	RacePusling               RaceID = 270
	RaceWaterMephit           RaceID = 271
	RaceStormrider            RaceID = 272
	RaceJunkBeast             RaceID = 273
	RaceBrokenClockwork       RaceID = 274
	RaceGiantClockwork        RaceID = 275
	RaceClockworkBeetle       RaceID = 276
	RaceNightmareGoblin       RaceID = 277
	RaceKarana                RaceID = 278
	RaceBloodRaven            RaceID = 279
	RaceNightmareGargoyle     RaceID = 280
	RaceMouthOfInsanity       RaceID = 281
	RaceSkeletalHorse         RaceID = 282
	RaceSaryrn                RaceID = 283
	RaceFenninRo              RaceID = 284
	RaceTormentor             RaceID = 285
	RaceSoulDevourer          RaceID = 286
	RaceNightmare             RaceID = 287
	RaceNewRallosZek          RaceID = 288
	RaceVallonZek             RaceID = 289
	RaceTallonZek             RaceID = 290
	RaceAirMephit             RaceID = 291
	RaceEarthMephit           RaceID = 292
	RaceFireMephit            RaceID = 293
	RaceNightmareMephit       RaceID = 294
	RaceZebuxoruk             RaceID = 295
	RaceMithanielMarr         RaceID = 296
	RaceUndeadKnight          RaceID = 297
	RaceRathe                 RaceID = 298
	RaceXegony                RaceID = 299
	RaceFiend                 RaceID = 300
	RaceTestObject            RaceID = 301
	RaceCrab                  RaceID = 302
	RacePhoenix               RaceID = 303
	RaceQuarm                 RaceID = 304
	RaceBear2                 RaceID = 305
	RaceEarthGolem            RaceID = 306
	RaceIronGolem             RaceID = 307
	RaceStormGolem            RaceID = 308
	RaceAirGolem              RaceID = 309
	RaceWoodGolem             RaceID = 310
	RaceFireGolem             RaceID = 311
	RaceWaterGolem            RaceID = 312
	RaceWarWraith             RaceID = 313
	RaceWrulon                RaceID = 314
	RaceKraken                RaceID = 315
	RacePoisonFrog            RaceID = 316
	RaceNilborien             RaceID = 317
	RaceValorian              RaceID = 318
	RaceWarBoar               RaceID = 319
	RaceEfreeti2              RaceID = 320
	RaceWarBoar2              RaceID = 321
	RaceValorian2             RaceID = 322
	RaceAnimatedArmor         RaceID = 323
	RaceUndeadFootman         RaceID = 324
	RaceRallosOgre            RaceID = 325
	RaceArachnid              RaceID = 326
	RaceCrystalSpider         RaceID = 327
	RaceZebuxoruksCage        RaceID = 328
	RacePortal                RaceID = 329
	RaceTrollCrewMember       RaceID = 331
	RacePirateDeckhand        RaceID = 332
	RaceBrokenSkullPirate     RaceID = 333
	RacePirateGhost           RaceID = 334
	RaceOneArmedPirate        RaceID = 335
	RaceSpiritmasterNadox     RaceID = 336
	RaceBrokenSkullTaskmaster RaceID = 337
	RaceGnomePirate           RaceID = 338
	RaceDarkElfPirate         RaceID = 339
	RaceOgrePirate            RaceID = 340
	RaceHumanPirate           RaceID = 341
	RaceEruditePirate         RaceID = 342
	RaceFrog                  RaceID = 343
	RaceTrollZombie           RaceID = 344
	RaceLuggald               RaceID = 345
	RaceLuggald2              RaceID = 346
	RaceLuggald3              RaceID = 347
	RaceDrogmor               RaceID = 348
	RaceFroglokSkeleton       RaceID = 349
	RaceUndeadFroglok         RaceID = 350
	RaceKnightOfHate          RaceID = 351
	RaceArcanistOfHate        RaceID = 352
	RaceVeksar                RaceID = 353
	RaceVeksar2               RaceID = 354
	RaceVeksar3               RaceID = 355
	RaceChokidai              RaceID = 356
	RaceUndeadChokidai        RaceID = 357
	RaceUndeadVeksar          RaceID = 358
	RaceUndeadVampire         RaceID = 359
	RaceVampire3              RaceID = 360
	RaceRujarkianOrc          RaceID = 361
	RaceBoneGolem             RaceID = 362
	RaceSynarcana             RaceID = 363
	RaceSandElf               RaceID = 364
	RaceMasterVampire         RaceID = 365
	RaceMasterOrc             RaceID = 366
	RaceSkeleton2             RaceID = 367
	RaceMummy                 RaceID = 368
	RaceNewGoblin             RaceID = 369
	RaceInsect                RaceID = 370
	RaceFroglokGhost          RaceID = 371
	RaceDervish2              RaceID = 372
	RaceShade2                RaceID = 373
	RaceGolem2                RaceID = 374
	RaceEvilEye2              RaceID = 375
	RaceBox                   RaceID = 376
	RaceBarrel                RaceID = 377
	RaceChest                 RaceID = 378
	RaceVase                  RaceID = 379
	RaceTable                 RaceID = 380
	RaceWeaponRack            RaceID = 381
	RaceCoffin                RaceID = 382
	RaceBones                 RaceID = 383
	RaceJokester              RaceID = 384
	RaceNihil                 RaceID = 385
	RaceTrusik                RaceID = 386
	RaceStoneWorker           RaceID = 387
	RaceHynid                 RaceID = 388
	RaceTurepta               RaceID = 389
	RaceCragbeast             RaceID = 390
	RaceStonemite             RaceID = 391
	RaceUkun                  RaceID = 392
	RaceIxt                   RaceID = 393
	RaceIkaav                 RaceID = 394
	RaceAneuk                 RaceID = 395
	RaceKyv                   RaceID = 396
	RaceNoc                   RaceID = 397
	RaceRatuk                 RaceID = 398
	RaceTaneth                RaceID = 399
	RaceHuvul                 RaceID = 400
	RaceMutna                 RaceID = 401
	RaceMastruq               RaceID = 402
	RaceTaelosian             RaceID = 403
	RaceDiscordShip           RaceID = 404
	RaceStoneWorker2          RaceID = 405
	RaceMataMuram             RaceID = 406
	RaceLightingWarrior       RaceID = 407
	RaceSuccubus              RaceID = 408
	RaceBazu                  RaceID = 409
	RaceFeran                 RaceID = 410
	RacePyrilen               RaceID = 411
	RaceChimera               RaceID = 412
	RaceDragorn               RaceID = 413
	RaceMurkglider            RaceID = 414
	RaceRat                   RaceID = 415
	RaceBat2                  RaceID = 416
	RaceGelidran              RaceID = 417
	RaceDiscordling           RaceID = 418
	RaceGirplan               RaceID = 419
	RaceMinotaur2             RaceID = 420
	RaceDragornBox            RaceID = 421
	RaceRunedOrb              RaceID = 422
	RaceDragonBones           RaceID = 423
	RaceMuramiteArmorPile     RaceID = 424
	RaceCrystalShard          RaceID = 425
	RacePortal2               RaceID = 426
	RaceCoinPurse             RaceID = 427
	RaceRockPile              RaceID = 428
	RaceMurkgliderEggSack     RaceID = 429
	RaceDrake2                RaceID = 430
	RaceDervish3              RaceID = 431
	RaceDrake3                RaceID = 432
	RaceGoblin2               RaceID = 433
	RaceKirin                 RaceID = 434
	RaceDragon                RaceID = 435
	RaceBasilisk              RaceID = 436
	RaceDragon2               RaceID = 437
	RaceDragon3               RaceID = 438
	RacePuma2                 RaceID = 439
	RaceSpider                RaceID = 440
	RaceSpiderQueen           RaceID = 441
	RaceAnimatedStatue        RaceID = 442
	RaceUnknown3              RaceID = 443
	RaceUnknown4              RaceID = 444
	RaceDragonEgg             RaceID = 445
	RaceDragonStatue          RaceID = 446
	RaceLavaRock              RaceID = 447
	RaceAnimatedStatue2       RaceID = 448
	RaceSpiderEggSack         RaceID = 449
	RaceLavaSpider            RaceID = 450
	RaceLavaSpiderQueen       RaceID = 451
	RaceDragon4               RaceID = 452
	RaceGiant2                RaceID = 453
	RaceWerewolf3             RaceID = 454
	RaceKobold2               RaceID = 455
	RaceSporali               RaceID = 456
	RaceGnomework             RaceID = 457
	RaceOrc2                  RaceID = 458
	RaceCorathus              RaceID = 459
	RaceCoral                 RaceID = 460
	RaceDrachnid2             RaceID = 461
	RaceDrachnidCocoon        RaceID = 462
	RaceFungusPatch           RaceID = 463
	RaceGargoyle2             RaceID = 464
	RaceWitheran              RaceID = 465
	RaceDarkLord              RaceID = 466
	RaceShiliskin             RaceID = 467
	RaceSnake                 RaceID = 468
	RaceEvilEye3              RaceID = 469
	RaceMinotaur3             RaceID = 470
	RaceZombie2               RaceID = 471
	RaceClockworkBoar         RaceID = 472
	RaceFairy2                RaceID = 473
	RaceWitheran2             RaceID = 474
	RaceAirElemental2         RaceID = 475
	RaceEarthElemental2       RaceID = 476
	RaceFireElemental2        RaceID = 477
	RaceWaterElemental2       RaceID = 478
	RaceAlligator2            RaceID = 479
	RaceBear3                 RaceID = 480
	RaceScaledWolf            RaceID = 481
	RaceWolf2                 RaceID = 482
	RaceSpiritWolf            RaceID = 483
	RaceSkeleton3             RaceID = 484
	RaceSpectre2              RaceID = 485
	RaceBolvirk               RaceID = 486
	RaceBanshee2              RaceID = 487
	RaceBanshee3              RaceID = 488
	RaceElddar                RaceID = 489
	RaceForestGiant2          RaceID = 490
	RaceBoneGolem2            RaceID = 491
	RaceHorse2                RaceID = 492
	RacePegasus2              RaceID = 493
	RaceShamblingMound        RaceID = 494
	RaceScrykin               RaceID = 495
	RaceTreant3               RaceID = 496
	RaceVampire4              RaceID = 497
	RaceAyonaeRo              RaceID = 498
	RaceSullonZek             RaceID = 499
	RaceBanner                RaceID = 500
	RaceFlag                  RaceID = 501
	RaceRowboat               RaceID = 502
	RaceBearTrap              RaceID = 503
	RaceClockworkBomb         RaceID = 504
	RaceDynamiteKeg           RaceID = 505
	RacePressurePlate         RaceID = 506
	RacePufferSpore           RaceID = 507
	RaceStoneRing             RaceID = 508
	RaceRootTentacle          RaceID = 509
	RaceRunicSymbol           RaceID = 510
	RaceSaltpetterBomb        RaceID = 511
	RaceFloatingSkull         RaceID = 512
	RaceSpikeTrap             RaceID = 513
	RaceTotem2                RaceID = 514
	RaceWeb                   RaceID = 515
	RaceWickerBasket          RaceID = 516
	RaceUnicorn2              RaceID = 517
	RaceHorse3                RaceID = 518
	RaceUnicorn3              RaceID = 519
	RaceBixie2                RaceID = 520
	RaceCentaur2              RaceID = 521
	RaceGiant3                RaceID = 523
	RaceGnoll2                RaceID = 524
	RaceGriffin2              RaceID = 525

	// All races bitmask
	RaceAllBitmask RaceID = 65535
)

var raceNames = map[RaceID]string{
	RaceAbhorrent:          "Abhorrent",
	RaceAirElemental2:      "Air Elemental",
	RaceAirMephit:          "Air Mephit",
	RaceAlligator2:         "Alligator",
	RaceAneuk:              "Aneuk",
	RaceAnimatedArmor:      "Animated Armor",
	RaceAnimatedHand:       "Animated Hand",
	RaceAnimatedStatue2:    "Animated Statue",
	RaceArachnid:           "Arachnid",
	RaceArcanistOfHate:     "Arcanist of Hate",
	RaceArmadillo:          "Armadillo",
	RaceAyonaeRo:           "Ayonae Ro",
	RaceBanshee3:           "Banshee",
	RaceHalasCitizen:       "Barbarian",
	RaceBarrel:             "Barrel",
	RaceBasilisk:           "Basilisk",
	RaceBat2:               "Bat",
	RaceBazu:               "Bazu",
	RaceBear3:              "Bear",
	RaceBearTrap:           "Bear Trap",
	RaceHumanBeggar:        "Beggar",
	RaceBertoxxulousNew:    "Bertoxxulous",
	RaceBixie2:             "Bixie",
	RaceBloodRaven:         "Blood Raven",
	RaceBolvirk:            "Bolvirk",
	RaceBoneGolem2:         "Bone Golem",
	RaceBones:              "Bones",
	RacePortal:             "BoT Portal",
	RaceBox:                "Box",
	RaceBristlebane:        "Bristlebane",
	RaceBrokenClockwork:    "Broken Clockwork",
	RaceBrontotherium:      "Brontotherium",
	RaceBubonian:           "Bubonian",
	RaceBubonianUnderling:  "Bubonian Underling",
	RaceCentaur2:           "Centaur",
	RaceChokidai:           "Chokidai",
	RaceClam:               "Clam",
	RaceClockworkBeetle:    "Clockwork Beetle",
	RaceClockworkBoar:      "Clockwork Boar",
	RaceClockworkBomb:      "Clockwork Bomb",
	RaceClockworkBrain:     "Clockwork Brain",
	RaceClockworkGnome:     "Clockwork Gnome",
	RaceClockworkGolem:     "Clockwork Golem",
	RaceCockatrice:         "Cockatrice",
	RaceCoinPurse:          "Coin Purse",
	RaceCoral:              "Coral",
	RaceCorathus:           "Corathus",
	RaceCrab:               "Crab",
	RaceCragbeast:          "Cragbeast",
	RaceCrocodile:          "Crocodile",
	RaceCrystalShard:       "Crystal Shard",
	RaceCrystalSpider:      "Crystal Spider",
	RaceDaisyMan:           "Daisy Man",
	RaceNeriakCitizen:      "Dark Elf",
	RaceDarkLord:           "Dark Lord",
	RaceDemiLich:           "Demi Lich",
	RaceDevourer:           "Devourer",
	RaceDireWolf:           "Dire Wolf",
	RaceDiscordShip:        "Discord Ship",
	RaceDiscordling:        "Discordling",
	RaceDiseasedFiend:      "Diseased Fiend",
	RaceDjinn:              "Djinn",
	RaceDrachnid2:          "Drachnid",
	RaceDrachnidCocoon:     "Drachnid Cocoon",
	RaceDraglock:           "Draglock",
	RaceDragonBones:        "Dragon Bones",
	RaceDragonEgg:          "Dragon Egg",
	RaceDragonStatue:       "Dragon Statue",
	RaceDragorn:            "Dragorn",
	RaceDragornBox:         "Dragorn Box",
	RaceDrake3:             "Drake",
	RaceDrixie:             "Drixie",
	RaceDrogmor:            "Drogmore",
	RaceDrolvarg:           "Drolvarg",
	RaceDryad:              "Dryad",
	RaceKaladimCitizen:     "Dwarf",
	RaceDynamiteKeg:        "Dynamite Keg",
	RaceEarthElemental2:    "Earth Elemental",
	RaceEarthMephit:        "Earth Mephit",
	RaceGiantEel:           "Eel",
	RaceEfreeti2:           "Efreeti",
	RaceElddar:             "Elddar",
	RaceEnchantedArmor:     "Enchanted Armor",
	RaceErollisi:           "Erollisi",
	RaceEvanTest:           "Evan Test",
	RaceEvilEye3:           "Evil Eye",
	RaceFairy2:             "Fairy",
	RaceFaun:               "Faun",
	RaceFayDrake:           "Fay Drake",
	RaceFenninRo:           "Fennin Ro",
	RaceFeran:              "Feran",
	RaceFiend:              "Fiend",
	RaceFireElemental2:     "Fire Elemental",
	RaceFireMephit:         "Fire Mephit",
	RaceKunarkFish:         "Fish",
	RaceFlag:               "Flag",
	RaceFloatingSkull:      "Floating Skull",
	RaceFly:                "Fly",
	RaceForestGiant2:       "Forest Giant",
	RaceFroglokGhost:       "Froglok Ghost",
	RaceFroglokSkeleton:    "Froglok Skeleton",
	RaceFungalFiend:        "Fungal Fiend",
	RaceFungusPatch:        "Fungus Patch",
	RaceFungusman:          "Fungusman",
	RaceGalorian:           "Galorian",
	RaceGargoyle2:          "Gargoyle",
	RaceGasbag:             "Gasbag",
	RaceGelidran:           "Gelidran",
	RaceGeonid:             "Geonid",
	RacePirateGhost:        "Ghost",
	RaceGiant3:             "Giant",
	RaceGiantClockwork:     "Giant Clockwork",
	RaceGirplan:            "Girplan",
	RaceGnome:              "Gnome",
	RaceGnomework:          "Gnomework",
	RaceGoblin2:            "Goblin",
	RaceGolem2:             "Golem",
	RaceGorgon:             "Gorgon",
	RaceGriegVeneficus:     "Grieg Veneficus",
	RaceGriffin2:           "Griffin",
	RaceGrimling:           "Grimling",
	RaceGroundShaker:       "Ground Shaker",
	RaceVahShirGuard:       "Guard",
	RaceGuardOfJustice:     "Guard of Justice",
	RaceHag:                "Hag",
	RaceHalfElf:            "Half Elf",
	RaceRivervaleCitizen:   "Halfling",
	RaceHighElf:            "High Elf",
	RaceHippogriff:         "Hippogriff",
	RaceHorse3:             "Horse",
	RaceHraquis:            "Hraquis",
	RaceHuvul:              "Huvul",
	RaceHynid:              "Hynid",
	RaceIceSpectre:         "Ice Spectre",
	RaceIkaav:              "Ikaav",
	RaceIksarCitizen:       "Iksar",
	RaceIksarGolem:         "Iksar Golem",
	RaceIksarSpirit:        "Iksar Spirit",
	RaceImp:                "Imp",
	RaceInnoruuk:           "Innoruuk",
	RaceInsect:             "Insect",
	RaceIxt:                "Ixt",
	RaceJokester:           "Jokester",
	RaceJunkBeast:          "Junk Beast",
	RaceKarana:             "Karana",
	RaceKnightOfHate:       "Knight of Hate",
	RaceKnightOfPestilence: "Knight of Pestilence",
	RaceKobold2:            "Kobold",
	RaceKraken:             "Kraken",
	RaceKyv:                "Kyv",
	RaceLaunch:             "Launch",
	RaceLavaRock:           "Lava Rock",
	RaceLavaSpider:         "Lava Spider",
	RaceLavaSpiderQueen:    "Lava Spider Queen",
	RaceLeech:              "Leech",
	RaceLepertoloth:        "Lepertoloth",
	RaceLightcrawler:       "Lightcrawler",
	RaceLightingWarrior:    "Lightning Warrior",
	RaceLion:               "Lion",
	RaceLizardMan:          "Lizard Man",
	RaceLuggald2:           "Luggald",
	RaceLuggald3:           "Luggalds",
	RaceMalarian:           "Malarian",
	RaceManEatingPlant:     "Man - Eating Plant",
	RaceManticore:          "Manticore",
	RaceMastruq:            "Mastruq",
	RaceMataMuram:          "Mata Muram",
	RaceMermaid:            "Mermaid",
	RaceMimic:              "Mimic",
	RaceMiniPom:            "Mini POM",
	RaceMithanielMarr:      "Mithaniel Marr",
	RaceMosquito:           "Mosquito",
	RaceMouthOfInsanity:    "Mouth of Insanity",
	RaceMummy:              "Mummy",
	RaceMuramiteArmorPile:  "Muramite Armor Pile",
	RaceMurkglider:         "Murkglider",
	RaceMurkgliderEggSack:  "Murkglider Egg Sac",
	RaceMutna:              "Mutna",
	RaceNetherbian:         "Netherbian",
	RaceNightmare:          "Nightmare",
	RaceNightmareGargoyle:  "Nightmare Gargoyle",
	RaceNightmareGoblin:    "Nightmare Goblin",
	RaceNightmareMephit:    "Nightmare Mephit",
	RaceUnicorn3:           "Nightmare / Unicorn",
	RaceNightmareWraith:    "Nightmare Wraith",
	RaceNihil:              "Nihil",
	RaceNilborien:          "Nilborien",
	RaceNoc:                "Noc",
	RaceNymph:              "Nymph",
	RaceOrc2:               "Orc",
	RaceOthmir:             "Othmir",
	RaceOwlbear:            "Owlbear",
	RacePhoenix:            "Phoenix",
	RacePiranha:            "Piranha",
	RaceEruditePirate:      "Pirate",
	RacePixie:              "Pixie",
	RacePoisonFrog:         "Poison Frog",
	RacePortal2:            "Portal",
	RacePressurePlate:      "Pressure Plate",
	RacePufferSpore:        "Puffer Spore",
	RacePusling:            "Pusling",
	RacePyrilen:            "Pyrilen",
	RaceRatuk:              "Ra`tuk",
	RaceNewRallosZek:       "Rallos Zek",
	RaceRallosOgre:         "Rallos Zek Minion",

	RaceRat: "Rat",

	RaceReanimatedHand: "Reanimated Hand",
	RaceRecuso:         "Recuso",

	RaceRhinoBeetle:  "Rhino Beetle",
	RaceRhinoceros:   "Rhinoceros",
	RaceRockPile:     "Rock Pile",
	RaceRockhopper:   "Rockhopper",
	RaceRonnieTest:   "Ronnie Test",
	RaceRootTentacle: "Root Tentacle",

	RaceRowboat: "Rowboat",

	RaceMasterOrc:      "Rujarkian Orc",
	RaceRunedOrb:       "Runed Orb",
	RaceRunicSymbol:    "Runic Symbol",
	RaceSabertooth:     "Saber - toothed Cat",
	RaceSaltpetterBomb: "Saltpetter Bomb",
	RaceSandElf:        "Sand Elf",
	RaceSarnakGolem:    "Sarnak Golem",
	RaceSarnakSpirit:   "Sarnak Spirit",
	RaceSaryrn:         "Saryrn",
	RaceScaledWolf:     "Scaled Wolf",
	RaceScarletCheetah: "Scarlet Cheetah",

	RaceScrykin:   "Scrykin",
	RaceSeaTurtle: "Sea Turtle",
	RaceSeaHorse:  "Seahorse",

	RaceLordInquisitorSeru: "Seru",

	RaceKhatiSha:       "Shadel",
	RaceShamblingMound: "Shambling Mound",
	RaceShark:          "Shark",
	RaceShiknar:        "Shik'Nar",
	RaceShiliskin:      "Shiliskin",
	RaceShip:           "Ship",

	RaceShrieker: "Shrieker",

	RaceSkeletalHorse: "Skeletal Horse",
	RaceSkeleton3:     "Skeleton",
	RaceSkunk:         "Skunk",

	RaceSnake:          "Snake",
	RaceSnakeElemental: "Snake Elemental",
	RaceSnowDervish:    "Snow Dervish",
	RaceSnowRabbit:     "Snow Rabbit",

	RaceSolusekRo2:     "Solusek Ro",
	RaceSolusekRoGuard: "Solusek Ro Guard",
	RaceSonicWolf:      "Sonic Wolf",
	RaceSoulDevourer:   "Soul Devourer",
	RaceSpectre2:       "Spectre",

	RaceSpider:        "Spider",
	RaceSpiderEggSack: "Spider Egg Sack",
	RaceSpiderQueen:   "Spider Queen",
	RaceSpikeTrap:     "Spike Trap",
	RaceSpiritWolf:    "Spirit Wolf",
	RaceSporali:       "Sporali",

	RaceStoneRing:      "Stone Ring",
	RaceStoneWorker2:   "Stone Worker",
	RaceStonegrabber:   "Stonegrabber",
	RaceStonemite:      "Stonemite",
	RaceStormrider:     "Stormrider",
	RaceSuccubus:       "Succubus",
	RaceSucculent:      "Succulent",
	RaceSullonZek:      "Sullon Zek",
	RaceShadel:         "Sun Revenant",
	RaceSunflower:      "Sunflower",
	RaceSwordfish:      "Swordfish",
	RaceSynarcana:      "Synarcana",
	RaceTable:          "Table",
	RaceFroglokTadpole: "Tadpole",
	RaceTaelosian:      "Taelosian",
	RaceTallonZek:      "Tallon Zek",
	RaceTaneth:         "Taneth",
	RaceTarewMarr:      "Tarew Marr",
	RaceTegi:           "Tegi",
	RaceTeleportMan:    "Teleport Man",

	RaceTerrisThule:   "Terris Thule",
	RaceTestObject:    "Test Object",
	RaceRathe:         "The Rathe",
	RaceTribunalNew:   "The Tribunal",
	RaceThoughtHorror: "Thought Horror",
	RaceTinSoldier:    "Tin Soldier",

	RaceTormentor:         "Tormentor",
	RaceTotem2:            "Totem",
	RaceTrakanon:          "Trakanon",
	RaceTranquilion:       "Tranquilion",
	RaceTreant3:           "Treant",
	RaceTribunal:          "Tribunal",
	RaceBrokenSkullPirate: "Troll",
	RaceTrollZombie:       "Troll Zombie",
	RaceTrusik:            "Trusik",

	RaceTunare:          "Tunare",
	RaceTurepta:         "Turepta",
	RaceUkun:            "Ukun",
	RaceUlthork:         "Ulthork",
	RaceUndeadChokidai:  "Undead Chokidai",
	RaceUndeadFootman:   "Undead Footman",
	RaceUndeadFroglok:   "Undead Froglok",
	RaceUndeadIksar:     "Undead Iksar",
	RaceUndeadKnight:    "Undead Knight",
	RaceUndeadSarnak:    "Undead Sarnak",
	RaceUndeadVeksar:    "Undead Veksar",
	RaceUnderbulk:       "Underbulk",
	RaceUnicorn:         "Unicorn",
	RaceUnknown4:        "UNKNOWN RACE",
	RaceVahShirKing:     "Vah Shir",
	RaceVahShirSkeleton: "Vah Shir Skeleton",
	RaceVallonZek:       "Vallon Zek",
	RaceValorian2:       "Valorian",
	RaceVampire4:        "Vampire",
	RaceVase:            "Vase",
	RaceVegerog:         "Vegerog",
	RaceVeksar3:         "Veksar",
	RaceVenrilSathir:    "Venril Sathir",

	RaceWalrus:          "Walrus",
	RaceWarBoar2:        "War Boar",
	RaceWarWraith:       "War Wraith",
	RaceWasp:            "Wasp",
	RaceWaterElemental2: "Water Elemental",
	RaceWaterMephit:     "Water Mephit",

	RaceWeb: "Web",

	RaceWerewolf3:     "Werewolf",
	RaceWetfangMinnow: "Wetfang Minnow",
	RaceWickerBasket:  "Wicker Basket",
	RaceWisp:          "Will - O - Wisp",
	RaceWitheran2:     "Witheran",
	RaceWolf2:         "Wolf",
	RaceWoodElf:       "Wood Elf",
	RaceWorm:          "Worm",
	RaceWretch:        "Wretch",

	RaceXalgoz:         "Xalgoz",
	RaceXegony:         "Xegony",
	RaceYakkar:         "Yakkar",
	RaceYeti:           "Yeti",
	RaceZebuxoruk:      "Zebuxoruk",
	RaceZebuxoruksCage: "Zebuxoruk's Cage",
	RaceZelniak:        "Zelniak",
	RaceZombie2:        "Zombie",
	RaceHuman:          "HUM",
	RaceBarbarian:      "BAR",
	RaceErudite:        "ERU",
	RaceDarkElf:        "DEF",
	RaceDwarf:          "DWF",
	RaceTroll:          "TRL",
	RaceOgre:           "OGR",
	RaceHalfling:       "HFL",
	RaceIksar:          "IKS",
	RaceVahShir:        "VAH",
}

func GetRaceIDName(race RaceID) string {
	if name, ok := raceNames[race]; ok {
		return name
	}
	return "UNKNOWN RACE"
}

// GetPlayerRaceName returns the name of a player race value.
func GetPlayerRaceName(val PlayerRace) string {
	return GetRaceIDName(GetRaceIDFromPlayerRaceValue(uint32(val)))
}

// GetPlayerRaceValue converts a RaceID into its PlayerRace equivalent.
func GetPlayerRaceValue(race RaceID) PlayerRace {
	switch race {
	case RaceHuman, RaceBarbarian, RaceErudite, RaceWoodElf,
		RaceHighElf, RaceDarkElf, RaceHalfElf, RaceDwarf,
		RaceTroll, RaceOgre, RaceHalfling, RaceGnome:
		return PlayerRace(race)
	case RaceIksar:
		return PlayerRaceIksar
	case RaceVahShir:
		return PlayerRaceVahshir
	case RaceFroglok:
		return PlayerRaceFroglok
	default:
		return PlayerRaceUnknown
	}
}

// GetPlayerRaceBit returns the bitmask for a given RaceID.
func GetPlayerRaceBit(race RaceID) uint32 {
	switch race {
	case RaceHuman:
		return PlayerRaceHumanBit
	case RaceBarbarian:
		return PlayerRaceBarbarianBit
	case RaceErudite:
		return PlayerRaceEruditeBit
	case RaceWoodElf:
		return PlayerRaceWoodElfBit
	case RaceHighElf:
		return PlayerRaceHighElfBit
	case RaceDarkElf:
		return PlayerRaceDarkElfBit
	case RaceHalfElf:
		return PlayerRaceHalfElfBit
	case RaceDwarf:
		return PlayerRaceDwarfBit
	case RaceTroll:
		return PlayerRaceTrollBit
	case RaceOgre:
		return PlayerRaceOgreBit
	case RaceHalfling:
		return PlayerRaceHalflingBit
	case RaceGnome:
		return PlayerRaceGnomeBit
	case RaceIksar:
		return PlayerRaceIksarBit
	case RaceVahShir:
		return PlayerRaceVahshirBit
	case RaceFroglok:
		return PlayerRaceFroglokBit
	default:
		return PlayerRaceUnknownBit
	}
}

// GetRaceIDFromPlayerRaceValue converts a PlayerRace back to RaceID.
func GetRaceIDFromPlayerRaceValue(val uint32) RaceID {
	switch PlayerRace(val) {
	case PlayerRaceHuman, PlayerRaceBarbarian, PlayerRaceErudite,
		PlayerRaceWoodElf, PlayerRaceHighElf, PlayerRaceDarkElf,
		PlayerRaceHalfElf, PlayerRaceDwarf, PlayerRaceTroll,
		PlayerRaceOgre, PlayerRaceHalfling, PlayerRaceGnome:
		return RaceID(val)
	case PlayerRaceIksar:
		return RaceIksar
	case PlayerRaceVahshir:
		return RaceVahShir
	case PlayerRaceFroglok:
		return RaceFroglok
	default:
		return RaceUnknown
	}
}

// GetRaceIDFromPlayerRaceBit converts a player race bitmask back to RaceID.
func GetRaceIDFromPlayerRaceBit(bit uint32) RaceID {
	switch bit {
	case PlayerRaceHumanBit:
		return RaceHuman
	case PlayerRaceBarbarianBit:
		return RaceBarbarian
	case PlayerRaceEruditeBit:
		return RaceErudite
	case PlayerRaceWoodElfBit:
		return RaceWoodElf
	case PlayerRaceHighElfBit:
		return RaceHighElf
	case PlayerRaceDarkElfBit:
		return RaceDarkElf
	case PlayerRaceHalfElfBit:
		return RaceHalfElf
	case PlayerRaceDwarfBit:
		return RaceDwarf
	case PlayerRaceTrollBit:
		return RaceTroll
	case PlayerRaceOgreBit:
		return RaceOgre
	case PlayerRaceHalflingBit:
		return RaceHalfling
	case PlayerRaceGnomeBit:
		return RaceGnome
	case PlayerRaceIksarBit:
		return RaceIksar
	case PlayerRaceVahshirBit:
		return RaceVahShir
	case PlayerRaceFroglokBit:
		return RaceFroglok
	default:
		return RaceUnknown
	}
}

// GetGenderName returns the string name for a Gender.
func GetGenderName(g Gender) string {
	switch g {
	case Gender_Male:
		return "Male"
	case Gender_Female:
		return "Female"
	case Gender_Neuter:
		return "Neuter"
	default:
		return "Unknown"
	}
}

// GetPlayerRaceAbbreviation gives a 3-letter code for core player races.
func GetPlayerRaceAbbreviation(race RaceID) string {
	if !IsPlayerRace(uint16(race)) {
		return "UNK"
	}
	switch race {
	case RaceHuman:
		return "HUM"
	case RaceBarbarian:
		return "BAR"
	case RaceErudite:
		return "ERU"
	case RaceWoodElf:
		return "ELF"
	case RaceHighElf:
		return "HIE"
	case RaceDarkElf:
		return "DEF"
	case RaceHalfElf:
		return "HEF"
	case RaceDwarf:
		return "DWF"
	case RaceTroll:
		return "TRL"
	case RaceOgre:
		return "OGR"
	case RaceHalfling:
		return "HFL"
	case RaceGnome:
		return "GNM"
	case RaceIksar:
		return "IKS"
	case RaceVahShir:
		return "VAH"
	case RaceFroglok:
		return "FRG"

	default:
		return "UNK"
	}
}

// IsPlayerRace returns true if the RaceID represents a playable race.
func IsPlayerRace(r uint16) bool {
	switch RaceID(r) {
	case RaceHuman, RaceBarbarian, RaceErudite, RaceWoodElf,
		RaceHighElf, RaceDarkElf, RaceHalfElf, RaceDwarf,
		RaceTroll, RaceOgre, RaceHalfling, RaceGnome,
		RaceIksar, RaceVahShir, RaceFroglok:
		return true
	default:
		return false
	}
}

// END of races.go
