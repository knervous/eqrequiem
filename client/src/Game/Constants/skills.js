export var Skills;
(function (Skills) {
    Skills[Skills["OneHandedBlunt"] = 0] = "OneHandedBlunt";
    Skills[Skills["OneHandedSlashing"] = 1] = "OneHandedSlashing";
    Skills[Skills["TwoHandedBlunt"] = 2] = "TwoHandedBlunt";
    Skills[Skills["TwoHandedSlashing"] = 3] = "TwoHandedSlashing";
    Skills[Skills["Abjuration"] = 4] = "Abjuration";
    Skills[Skills["Alteration"] = 5] = "Alteration";
    Skills[Skills["ApplyPoison"] = 6] = "ApplyPoison";
    Skills[Skills["Archery"] = 7] = "Archery";
    Skills[Skills["Backstab"] = 8] = "Backstab";
    Skills[Skills["BindWound"] = 9] = "BindWound";
    Skills[Skills["Bash"] = 10] = "Bash";
    Skills[Skills["Block"] = 11] = "Block";
    Skills[Skills["BrassInstruments"] = 12] = "BrassInstruments";
    Skills[Skills["Channeling"] = 13] = "Channeling";
    Skills[Skills["Conjuration"] = 14] = "Conjuration";
    Skills[Skills["Defense"] = 15] = "Defense";
    Skills[Skills["Disarm"] = 16] = "Disarm";
    Skills[Skills["DisarmTraps"] = 17] = "DisarmTraps";
    Skills[Skills["Divination"] = 18] = "Divination";
    Skills[Skills["Dodge"] = 19] = "Dodge";
    Skills[Skills["DoubleAttack"] = 20] = "DoubleAttack";
    Skills[Skills["DragonPunchTailRake"] = 21] = "DragonPunchTailRake";
    Skills[Skills["DualWield"] = 22] = "DualWield";
    Skills[Skills["EagleStrike"] = 23] = "EagleStrike";
    Skills[Skills["Evocation"] = 24] = "Evocation";
    Skills[Skills["FeignDeath"] = 25] = "FeignDeath";
    Skills[Skills["FlyingKick"] = 26] = "FlyingKick";
    Skills[Skills["Forage"] = 27] = "Forage";
    Skills[Skills["HandToHand"] = 28] = "HandToHand";
    Skills[Skills["Hide"] = 29] = "Hide";
    Skills[Skills["Kick"] = 30] = "Kick";
    Skills[Skills["Meditate"] = 31] = "Meditate";
    Skills[Skills["Mend"] = 32] = "Mend";
    Skills[Skills["Offense"] = 33] = "Offense";
    Skills[Skills["Parry"] = 34] = "Parry";
    Skills[Skills["PickLock"] = 35] = "PickLock";
    Skills[Skills["OneHandedPiercing"] = 36] = "OneHandedPiercing";
    Skills[Skills["Riposte"] = 37] = "Riposte";
    Skills[Skills["RoundKick"] = 38] = "RoundKick";
    Skills[Skills["SafeFall"] = 39] = "SafeFall";
    Skills[Skills["SenseHeading"] = 40] = "SenseHeading";
    Skills[Skills["Singing"] = 41] = "Singing";
    Skills[Skills["Sneak"] = 42] = "Sneak";
    Skills[Skills["SpecializeAbjure"] = 43] = "SpecializeAbjure";
    Skills[Skills["SpecializeAlteration"] = 44] = "SpecializeAlteration";
    Skills[Skills["SpecializeConjuration"] = 45] = "SpecializeConjuration";
    Skills[Skills["SpecializeDivination"] = 46] = "SpecializeDivination";
    Skills[Skills["SpecializeEvocation"] = 47] = "SpecializeEvocation";
    Skills[Skills["PickPockets"] = 48] = "PickPockets";
    Skills[Skills["StringedInstruments"] = 49] = "StringedInstruments";
    Skills[Skills["Swimming"] = 50] = "Swimming";
    Skills[Skills["Throwing"] = 51] = "Throwing";
    Skills[Skills["TigerClaw"] = 52] = "TigerClaw";
    Skills[Skills["Tracking"] = 53] = "Tracking";
    Skills[Skills["WindInstruments"] = 54] = "WindInstruments";
    Skills[Skills["Fishing"] = 55] = "Fishing";
    Skills[Skills["MakePoison"] = 56] = "MakePoison";
    Skills[Skills["Tinkering"] = 57] = "Tinkering";
    Skills[Skills["Research"] = 58] = "Research";
    Skills[Skills["Alchemy"] = 59] = "Alchemy";
    Skills[Skills["Baking"] = 60] = "Baking";
    Skills[Skills["Tailoring"] = 61] = "Tailoring";
    Skills[Skills["SenseTraps"] = 62] = "SenseTraps";
    Skills[Skills["Blacksmithing"] = 63] = "Blacksmithing";
    Skills[Skills["Fletching"] = 64] = "Fletching";
    Skills[Skills["Brewing"] = 65] = "Brewing";
    Skills[Skills["AlcoholTolerance"] = 66] = "AlcoholTolerance";
    Skills[Skills["Begging"] = 67] = "Begging";
    Skills[Skills["JewelryMaking"] = 68] = "JewelryMaking";
    Skills[Skills["Pottery"] = 69] = "Pottery";
    Skills[Skills["PercussionInstruments"] = 70] = "PercussionInstruments";
    Skills[Skills["Intimidation"] = 71] = "Intimidation";
    Skills[Skills["Berserking"] = 72] = "Berserking";
    Skills[Skills["Taunt"] = 73] = "Taunt";
    Skills[Skills["Frenzy"] = 74] = "Frenzy";
    Skills[Skills["RemoveTraps"] = 75] = "RemoveTraps";
    Skills[Skills["TripleAttack"] = 76] = "TripleAttack";
    Skills[Skills["TwoHandedPiercing"] = 77] = "TwoHandedPiercing";
})(Skills || (Skills = {}));
export const ActiveCombatSkills = [
    Skills.ApplyPoison,
    Skills.Backstab,
    Skills.Bash,
    Skills.Disarm, // 15
    Skills.DragonPunchTailRake, // Dragon Punch is the Iksar Monk skill Tail Rake is the Iksar Monk equivalent
    Skills.DualWield, // 20
    Skills.EagleStrike,
    Skills.Evocation,
    Skills.FlyingKick,
    Skills.Kick,
    Skills.RoundKick,
];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2tpbGxzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2tpbGxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUVBLE1BQU0sQ0FBTixJQUFZLE1BK0VYO0FBL0VELFdBQVksTUFBTTtJQUNkLHVEQUFjLENBQUE7SUFDZCw2REFBaUIsQ0FBQTtJQUNqQix1REFBYyxDQUFBO0lBQ2QsNkRBQWlCLENBQUE7SUFDakIsK0NBQVUsQ0FBQTtJQUNWLCtDQUFVLENBQUE7SUFDVixpREFBVyxDQUFBO0lBQ1gseUNBQU8sQ0FBQTtJQUNQLDJDQUFRLENBQUE7SUFDUiw2Q0FBUyxDQUFBO0lBQ1Qsb0NBQUksQ0FBQTtJQUNKLHNDQUFLLENBQUE7SUFDTCw0REFBZ0IsQ0FBQTtJQUNoQixnREFBVSxDQUFBO0lBQ1Ysa0RBQVcsQ0FBQTtJQUNYLDBDQUFPLENBQUE7SUFDUCx3Q0FBTSxDQUFBO0lBQ04sa0RBQVcsQ0FBQTtJQUNYLGdEQUFVLENBQUE7SUFDVixzQ0FBSyxDQUFBO0lBQ0wsb0RBQVksQ0FBQTtJQUNaLGtFQUFtQixDQUFBO0lBQ25CLDhDQUFTLENBQUE7SUFDVCxrREFBVyxDQUFBO0lBQ1gsOENBQVMsQ0FBQTtJQUNULGdEQUFVLENBQUE7SUFDVixnREFBVSxDQUFBO0lBQ1Ysd0NBQU0sQ0FBQTtJQUNOLGdEQUFVLENBQUE7SUFDVixvQ0FBSSxDQUFBO0lBQ0osb0NBQUksQ0FBQTtJQUNKLDRDQUFRLENBQUE7SUFDUixvQ0FBSSxDQUFBO0lBQ0osMENBQU8sQ0FBQTtJQUNQLHNDQUFLLENBQUE7SUFDTCw0Q0FBUSxDQUFBO0lBQ1IsOERBQWlCLENBQUE7SUFDakIsMENBQU8sQ0FBQTtJQUNQLDhDQUFTLENBQUE7SUFDVCw0Q0FBUSxDQUFBO0lBQ1Isb0RBQVksQ0FBQTtJQUNaLDBDQUFPLENBQUE7SUFDUCxzQ0FBSyxDQUFBO0lBQ0wsNERBQWdCLENBQUE7SUFDaEIsb0VBQW9CLENBQUE7SUFDcEIsc0VBQXFCLENBQUE7SUFDckIsb0VBQW9CLENBQUE7SUFDcEIsa0VBQW1CLENBQUE7SUFDbkIsa0RBQVcsQ0FBQTtJQUNYLGtFQUFtQixDQUFBO0lBQ25CLDRDQUFRLENBQUE7SUFDUiw0Q0FBUSxDQUFBO0lBQ1IsOENBQVMsQ0FBQTtJQUNULDRDQUFRLENBQUE7SUFDUiwwREFBZSxDQUFBO0lBQ2YsMENBQU8sQ0FBQTtJQUNQLGdEQUFVLENBQUE7SUFDViw4Q0FBUyxDQUFBO0lBQ1QsNENBQVEsQ0FBQTtJQUNSLDBDQUFPLENBQUE7SUFDUCx3Q0FBTSxDQUFBO0lBQ04sOENBQVMsQ0FBQTtJQUNULGdEQUFVLENBQUE7SUFDVixzREFBYSxDQUFBO0lBQ2IsOENBQVMsQ0FBQTtJQUNULDBDQUFPLENBQUE7SUFDUCw0REFBZ0IsQ0FBQTtJQUNoQiwwQ0FBTyxDQUFBO0lBQ1Asc0RBQWEsQ0FBQTtJQUNiLDBDQUFPLENBQUE7SUFDUCxzRUFBcUIsQ0FBQTtJQUNyQixvREFBWSxDQUFBO0lBQ1osZ0RBQVUsQ0FBQTtJQUNWLHNDQUFLLENBQUE7SUFDTCx3Q0FBTSxDQUFBO0lBQ04sa0RBQVcsQ0FBQTtJQUNYLG9EQUFZLENBQUE7SUFDWiw4REFBaUIsQ0FBQTtBQUNyQixDQUFDLEVBL0VXLE1BQU0sS0FBTixNQUFNLFFBK0VqQjtBQUVELE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHO0lBQ2hDLE1BQU0sQ0FBQyxXQUFXO0lBQ2xCLE1BQU0sQ0FBQyxRQUFRO0lBQ2YsTUFBTSxDQUFDLElBQUk7SUFDWCxNQUFNLENBQUMsTUFBTSxFQUFFLEtBQUs7SUFDcEIsTUFBTSxDQUFDLG1CQUFtQixFQUFFLDhFQUE4RTtJQUMxRyxNQUFNLENBQUMsU0FBUyxFQUFFLEtBQUs7SUFDdkIsTUFBTSxDQUFDLFdBQVc7SUFDbEIsTUFBTSxDQUFDLFNBQVM7SUFDaEIsTUFBTSxDQUFDLFVBQVU7SUFDakIsTUFBTSxDQUFDLElBQUk7SUFDWCxNQUFNLENBQUMsU0FBUztDQUNMLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJcblxuZXhwb3J0IGVudW0gU2tpbGxzIHtcbiAgICBPbmVIYW5kZWRCbHVudCxcbiAgICBPbmVIYW5kZWRTbGFzaGluZyxcbiAgICBUd29IYW5kZWRCbHVudCxcbiAgICBUd29IYW5kZWRTbGFzaGluZyxcbiAgICBBYmp1cmF0aW9uLFxuICAgIEFsdGVyYXRpb24sIC8vIDVcbiAgICBBcHBseVBvaXNvbixcbiAgICBBcmNoZXJ5LFxuICAgIEJhY2tzdGFiLFxuICAgIEJpbmRXb3VuZCxcbiAgICBCYXNoLCAvLyAxMFxuICAgIEJsb2NrLFxuICAgIEJyYXNzSW5zdHJ1bWVudHMsXG4gICAgQ2hhbm5lbGluZyxcbiAgICBDb25qdXJhdGlvbixcbiAgICBEZWZlbnNlLCAvLyAxNVxuICAgIERpc2FybSxcbiAgICBEaXNhcm1UcmFwcyxcbiAgICBEaXZpbmF0aW9uLFxuICAgIERvZGdlLFxuICAgIERvdWJsZUF0dGFjaywgLy8gMjBcbiAgICBEcmFnb25QdW5jaFRhaWxSYWtlLCAvLyBEcmFnb24gUHVuY2ggaXMgdGhlIElrc2FyIE1vbmsgc2tpbGwgVGFpbCBSYWtlIGlzIHRoZSBJa3NhciBNb25rIGVxdWl2YWxlbnRcbiAgICBEdWFsV2llbGQsXG4gICAgRWFnbGVTdHJpa2UsXG4gICAgRXZvY2F0aW9uLFxuICAgIEZlaWduRGVhdGgsIC8vIDI1XG4gICAgRmx5aW5nS2ljayxcbiAgICBGb3JhZ2UsXG4gICAgSGFuZFRvSGFuZCxcbiAgICBIaWRlLFxuICAgIEtpY2ssIC8vIDMwXG4gICAgTWVkaXRhdGUsXG4gICAgTWVuZCxcbiAgICBPZmZlbnNlLFxuICAgIFBhcnJ5LFxuICAgIFBpY2tMb2NrLCAvLyAzNVxuICAgIE9uZUhhbmRlZFBpZXJjaW5nLCAvLyBDaGFuZ2VkIGluIFJvRjIoMDUtMTAtMlxuICAgIFJpcG9zdGUsXG4gICAgUm91bmRLaWNrLFxuICAgIFNhZmVGYWxsLFxuICAgIFNlbnNlSGVhZGluZywgLy8gNDBcbiAgICBTaW5naW5nLFxuICAgIFNuZWFrLFxuICAgIFNwZWNpYWxpemVBYmp1cmUsIC8vIE5vIGlkZWEgd2h5IHRoZXkgdHJ1bmNhXG4gICAgU3BlY2lhbGl6ZUFsdGVyYXRpb24sXG4gICAgU3BlY2lhbGl6ZUNvbmp1cmF0aW9uLCAvLyA0NVxuICAgIFNwZWNpYWxpemVEaXZpbmF0aW9uLFxuICAgIFNwZWNpYWxpemVFdm9jYXRpb24sXG4gICAgUGlja1BvY2tldHMsXG4gICAgU3RyaW5nZWRJbnN0cnVtZW50cyxcbiAgICBTd2ltbWluZywgLy8gNTBcbiAgICBUaHJvd2luZyxcbiAgICBUaWdlckNsYXcsXG4gICAgVHJhY2tpbmcsXG4gICAgV2luZEluc3RydW1lbnRzLFxuICAgIEZpc2hpbmcsIC8vIDU1XG4gICAgTWFrZVBvaXNvbixcbiAgICBUaW5rZXJpbmcsXG4gICAgUmVzZWFyY2gsXG4gICAgQWxjaGVteSxcbiAgICBCYWtpbmcsIC8vIDYwXG4gICAgVGFpbG9yaW5nLFxuICAgIFNlbnNlVHJhcHMsXG4gICAgQmxhY2tzbWl0aGluZyxcbiAgICBGbGV0Y2hpbmcsXG4gICAgQnJld2luZywgLy8gNjVcbiAgICBBbGNvaG9sVG9sZXJhbmNlLFxuICAgIEJlZ2dpbmcsXG4gICAgSmV3ZWxyeU1ha2luZyxcbiAgICBQb3R0ZXJ5LFxuICAgIFBlcmN1c3Npb25JbnN0cnVtZW50cywgLy8gNzBcbiAgICBJbnRpbWlkYXRpb24sXG4gICAgQmVyc2Vya2luZyxcbiAgICBUYXVudCxcbiAgICBGcmVuenksIC8vIDc0XG4gICAgUmVtb3ZlVHJhcHMsIC8vIDc1XG4gICAgVHJpcGxlQXR0YWNrLFxuICAgIFR3b0hhbmRlZFBpZXJjaW5nLCAvLyA3N1xufVxuXG5leHBvcnQgY29uc3QgQWN0aXZlQ29tYmF0U2tpbGxzID0gW1xuICBTa2lsbHMuQXBwbHlQb2lzb24sXG4gIFNraWxscy5CYWNrc3RhYixcbiAgU2tpbGxzLkJhc2gsXG4gIFNraWxscy5EaXNhcm0sIC8vIDE1XG4gIFNraWxscy5EcmFnb25QdW5jaFRhaWxSYWtlLCAvLyBEcmFnb24gUHVuY2ggaXMgdGhlIElrc2FyIE1vbmsgc2tpbGwgVGFpbCBSYWtlIGlzIHRoZSBJa3NhciBNb25rIGVxdWl2YWxlbnRcbiAgU2tpbGxzLkR1YWxXaWVsZCwgLy8gMjBcbiAgU2tpbGxzLkVhZ2xlU3RyaWtlLFxuICBTa2lsbHMuRXZvY2F0aW9uLFxuICBTa2lsbHMuRmx5aW5nS2ljayxcbiAgU2tpbGxzLktpY2ssXG4gIFNraWxscy5Sb3VuZEtpY2ssXG5dIGFzIFNraWxsc1tdO1xuIl19