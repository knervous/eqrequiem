export var InventorySlot;
(function (InventorySlot) {
    InventorySlot[InventorySlot["Charm"] = 0] = "Charm";
    InventorySlot[InventorySlot["Ear1"] = 1] = "Ear1";
    InventorySlot[InventorySlot["Head"] = 2] = "Head";
    InventorySlot[InventorySlot["Face"] = 3] = "Face";
    InventorySlot[InventorySlot["Ear2"] = 4] = "Ear2";
    InventorySlot[InventorySlot["Neck"] = 5] = "Neck";
    InventorySlot[InventorySlot["Shoulders"] = 6] = "Shoulders";
    InventorySlot[InventorySlot["Arms"] = 7] = "Arms";
    InventorySlot[InventorySlot["Back"] = 8] = "Back";
    InventorySlot[InventorySlot["Wrist1"] = 9] = "Wrist1";
    InventorySlot[InventorySlot["Wrist2"] = 10] = "Wrist2";
    InventorySlot[InventorySlot["Range"] = 11] = "Range";
    InventorySlot[InventorySlot["Hands"] = 12] = "Hands";
    InventorySlot[InventorySlot["Primary"] = 13] = "Primary";
    InventorySlot[InventorySlot["Secondary"] = 14] = "Secondary";
    InventorySlot[InventorySlot["Finger1"] = 15] = "Finger1";
    InventorySlot[InventorySlot["Finger2"] = 16] = "Finger2";
    InventorySlot[InventorySlot["Chest"] = 17] = "Chest";
    InventorySlot[InventorySlot["Legs"] = 18] = "Legs";
    InventorySlot[InventorySlot["Feet"] = 19] = "Feet";
    InventorySlot[InventorySlot["Waist"] = 20] = "Waist";
    InventorySlot[InventorySlot["Ammo"] = 21] = "Ammo";
    InventorySlot[InventorySlot["General1"] = 22] = "General1";
    InventorySlot[InventorySlot["General2"] = 23] = "General2";
    InventorySlot[InventorySlot["General3"] = 24] = "General3";
    InventorySlot[InventorySlot["General4"] = 25] = "General4";
    InventorySlot[InventorySlot["General5"] = 26] = "General5";
    InventorySlot[InventorySlot["General6"] = 27] = "General6";
    InventorySlot[InventorySlot["General7"] = 28] = "General7";
    InventorySlot[InventorySlot["General8"] = 29] = "General8";
    InventorySlot[InventorySlot["Cursor"] = 30] = "Cursor";
})(InventorySlot || (InventorySlot = {}));
export const InventorySlotTextures = {
    'he': InventorySlot.Head,
    'ch': InventorySlot.Chest,
    'ua': InventorySlot.Arms,
    'fa': InventorySlot.Wrist1,
    'lg': InventorySlot.Legs,
    'hn': InventorySlot.Hands,
    'ft': InventorySlot.Feet,
};
export const TextureProfileMap = {
    'he': 'head',
    'ch': 'chest',
    'ua': 'arms',
    'fa': 'wrist',
    'lg': 'legs',
    'hn': 'hands',
    'ft': 'feet',
};
export const InventorySlotNames = {
    [InventorySlot.Charm]: 'Charm',
    [InventorySlot.Ear1]: 'Ear',
    [InventorySlot.Head]: 'Head',
    [InventorySlot.Face]: 'Face',
    [InventorySlot.Ear2]: 'Ear',
    [InventorySlot.Neck]: 'Neck',
    [InventorySlot.Shoulders]: 'Shoulders',
    [InventorySlot.Arms]: 'Arms',
    [InventorySlot.Back]: 'Back',
    [InventorySlot.Wrist1]: 'Wrist',
    [InventorySlot.Wrist2]: 'Wrist',
    [InventorySlot.Range]: 'Range',
    [InventorySlot.Hands]: 'Hands',
    [InventorySlot.Primary]: 'Primary',
    [InventorySlot.Secondary]: 'Secondary',
    [InventorySlot.Finger1]: 'Finger',
    [InventorySlot.Finger2]: 'Finger',
    [InventorySlot.Chest]: 'Chest',
    [InventorySlot.Legs]: 'Legs',
    [InventorySlot.Feet]: 'Feet',
    [InventorySlot.Waist]: 'Waist',
    [InventorySlot.Ammo]: 'Ammo',
};
export const getSlotNamesFromBitmask = (bitmask) => {
    return Array.from(new Set(Object.entries(InventorySlotNames)
        .filter(([slot, _]) => (bitmask & (1 << +slot)) !== 0)
        .map(([, name]) => name))).join(' ');
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGxheWVyLWNvbnN0YW50cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInBsYXllci1jb25zdGFudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBSUEsTUFBTSxDQUFOLElBQVksYUFnQ1Q7QUFoQ0gsV0FBWSxhQUFhO0lBQ3JCLG1EQUFLLENBQUE7SUFDTCxpREFBSSxDQUFBO0lBQ0osaURBQUksQ0FBQTtJQUNKLGlEQUFJLENBQUE7SUFDSixpREFBSSxDQUFBO0lBQ0osaURBQUksQ0FBQTtJQUNKLDJEQUFTLENBQUE7SUFDVCxpREFBSSxDQUFBO0lBQ0osaURBQUksQ0FBQTtJQUNKLHFEQUFNLENBQUE7SUFDTixzREFBTSxDQUFBO0lBQ04sb0RBQUssQ0FBQTtJQUNMLG9EQUFLLENBQUE7SUFDTCx3REFBTyxDQUFBO0lBQ1AsNERBQVMsQ0FBQTtJQUNULHdEQUFPLENBQUE7SUFDUCx3REFBTyxDQUFBO0lBQ1Asb0RBQUssQ0FBQTtJQUNMLGtEQUFJLENBQUE7SUFDSixrREFBSSxDQUFBO0lBQ0osb0RBQUssQ0FBQTtJQUNMLGtEQUFJLENBQUE7SUFDSiwwREFBUSxDQUFBO0lBQ1IsMERBQVEsQ0FBQTtJQUNSLDBEQUFRLENBQUE7SUFDUiwwREFBUSxDQUFBO0lBQ1IsMERBQVEsQ0FBQTtJQUNSLDBEQUFRLENBQUE7SUFDUiwwREFBUSxDQUFBO0lBQ1IsMERBQVEsQ0FBQTtJQUNSLHNEQUFNLENBQUE7QUFDUixDQUFDLEVBaENTLGFBQWEsS0FBYixhQUFhLFFBZ0N0QjtBQUVILE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUFHO0lBQ25DLElBQUksRUFBRSxhQUFhLENBQUMsSUFBSTtJQUN4QixJQUFJLEVBQUUsYUFBYSxDQUFDLEtBQUs7SUFDekIsSUFBSSxFQUFFLGFBQWEsQ0FBQyxJQUFJO0lBQ3hCLElBQUksRUFBRSxhQUFhLENBQUMsTUFBTTtJQUMxQixJQUFJLEVBQUUsYUFBYSxDQUFDLElBQUk7SUFDeEIsSUFBSSxFQUFFLGFBQWEsQ0FBQyxLQUFLO0lBQ3pCLElBQUksRUFBRSxhQUFhLENBQUMsSUFBSTtDQUNRLENBQUM7QUFFbkMsTUFBTSxDQUFDLE1BQU0saUJBQWlCLEdBQUc7SUFDL0IsSUFBSSxFQUFFLE1BQU07SUFDWixJQUFJLEVBQUUsT0FBTztJQUNiLElBQUksRUFBRSxNQUFNO0lBQ1osSUFBSSxFQUFFLE9BQU87SUFDYixJQUFJLEVBQUUsTUFBTTtJQUNaLElBQUksRUFBRSxPQUFPO0lBQ2IsSUFBSSxFQUFFLE1BQU07Q0FDYSxDQUFDO0FBRzVCLE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHO0lBQ2hDLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxFQUFNLE9BQU87SUFDbEMsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEVBQU8sS0FBSztJQUNoQyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsRUFBTyxNQUFNO0lBQ2pDLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxFQUFPLE1BQU07SUFDakMsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEVBQU8sS0FBSztJQUNoQyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsRUFBTyxNQUFNO0lBQ2pDLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFdBQVc7SUFDdEMsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEVBQU8sTUFBTTtJQUNqQyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsRUFBTyxNQUFNO0lBQ2pDLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxFQUFLLE9BQU87SUFDbEMsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLEVBQUssT0FBTztJQUNsQyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBTSxPQUFPO0lBQ2xDLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxFQUFNLE9BQU87SUFDbEMsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLEVBQUksU0FBUztJQUNwQyxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsRUFBRSxXQUFXO0lBQ3RDLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxFQUFJLFFBQVE7SUFDbkMsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLEVBQUksUUFBUTtJQUNuQyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBTSxPQUFPO0lBQ2xDLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxFQUFPLE1BQU07SUFDakMsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEVBQU8sTUFBTTtJQUNqQyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBTSxPQUFPO0lBQ2xDLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxFQUFPLE1BQU07Q0FDekIsQ0FBQztBQUVYLE1BQU0sQ0FBQyxNQUFNLHVCQUF1QixHQUFHLENBQUMsT0FBZSxFQUFVLEVBQUU7SUFDakUsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUM7U0FDekQsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsT0FBTyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7U0FDckQsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ3pDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEl0ZW1JbnN0YW5jZSB9IGZyb20gJ0BnYW1lL05ldC9tZXNzYWdlcyc7XG5cbmV4cG9ydCB0eXBlIE51bGxhYmxlSXRlbUluc3RhbmNlID0gSXRlbUluc3RhbmNlIHwgbnVsbDtcblxuZXhwb3J0IGVudW0gSW52ZW50b3J5U2xvdCB7XG4gICAgQ2hhcm0sXG4gICAgRWFyMSxcbiAgICBIZWFkLFxuICAgIEZhY2UsXG4gICAgRWFyMixcbiAgICBOZWNrLFxuICAgIFNob3VsZGVycyxcbiAgICBBcm1zLFxuICAgIEJhY2ssXG4gICAgV3Jpc3QxLFxuICAgIFdyaXN0MixcbiAgICBSYW5nZSxcbiAgICBIYW5kcyxcbiAgICBQcmltYXJ5LFxuICAgIFNlY29uZGFyeSxcbiAgICBGaW5nZXIxLFxuICAgIEZpbmdlcjIsXG4gICAgQ2hlc3QsXG4gICAgTGVncyxcbiAgICBGZWV0LFxuICAgIFdhaXN0LFxuICAgIEFtbW8sXG4gICAgR2VuZXJhbDEsXG4gICAgR2VuZXJhbDIsXG4gICAgR2VuZXJhbDMsXG4gICAgR2VuZXJhbDQsXG4gICAgR2VuZXJhbDUsXG4gICAgR2VuZXJhbDYsXG4gICAgR2VuZXJhbDcsXG4gICAgR2VuZXJhbDgsXG4gICAgQ3Vyc29yXG4gIH1cblxuZXhwb3J0IGNvbnN0IEludmVudG9yeVNsb3RUZXh0dXJlcyA9IHtcbiAgJ2hlJzogSW52ZW50b3J5U2xvdC5IZWFkLFxuICAnY2gnOiBJbnZlbnRvcnlTbG90LkNoZXN0LFxuICAndWEnOiBJbnZlbnRvcnlTbG90LkFybXMsXG4gICdmYSc6IEludmVudG9yeVNsb3QuV3Jpc3QxLFxuICAnbGcnOiBJbnZlbnRvcnlTbG90LkxlZ3MsXG4gICdobic6IEludmVudG9yeVNsb3QuSGFuZHMsXG4gICdmdCc6IEludmVudG9yeVNsb3QuRmVldCxcbn0gYXMgUmVjb3JkPHN0cmluZywgSW52ZW50b3J5U2xvdD47XG5cbmV4cG9ydCBjb25zdCBUZXh0dXJlUHJvZmlsZU1hcCA9IHtcbiAgJ2hlJzogJ2hlYWQnLFxuICAnY2gnOiAnY2hlc3QnLFxuICAndWEnOiAnYXJtcycsXG4gICdmYSc6ICd3cmlzdCcsXG4gICdsZyc6ICdsZWdzJyxcbiAgJ2huJzogJ2hhbmRzJyxcbiAgJ2Z0JzogJ2ZlZXQnLFxufSBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXG5cbmV4cG9ydCBjb25zdCBJbnZlbnRvcnlTbG90TmFtZXMgPSB7XG4gIFtJbnZlbnRvcnlTbG90LkNoYXJtXSAgICA6ICdDaGFybScsXG4gIFtJbnZlbnRvcnlTbG90LkVhcjFdICAgICA6ICdFYXInLFxuICBbSW52ZW50b3J5U2xvdC5IZWFkXSAgICAgOiAnSGVhZCcsXG4gIFtJbnZlbnRvcnlTbG90LkZhY2VdICAgICA6ICdGYWNlJyxcbiAgW0ludmVudG9yeVNsb3QuRWFyMl0gICAgIDogJ0VhcicsXG4gIFtJbnZlbnRvcnlTbG90Lk5lY2tdICAgICA6ICdOZWNrJyxcbiAgW0ludmVudG9yeVNsb3QuU2hvdWxkZXJzXTogJ1Nob3VsZGVycycsXG4gIFtJbnZlbnRvcnlTbG90LkFybXNdICAgICA6ICdBcm1zJyxcbiAgW0ludmVudG9yeVNsb3QuQmFja10gICAgIDogJ0JhY2snLFxuICBbSW52ZW50b3J5U2xvdC5XcmlzdDFdICAgOiAnV3Jpc3QnLFxuICBbSW52ZW50b3J5U2xvdC5XcmlzdDJdICAgOiAnV3Jpc3QnLFxuICBbSW52ZW50b3J5U2xvdC5SYW5nZV0gICAgOiAnUmFuZ2UnLFxuICBbSW52ZW50b3J5U2xvdC5IYW5kc10gICAgOiAnSGFuZHMnLFxuICBbSW52ZW50b3J5U2xvdC5QcmltYXJ5XSAgOiAnUHJpbWFyeScsXG4gIFtJbnZlbnRvcnlTbG90LlNlY29uZGFyeV06ICdTZWNvbmRhcnknLFxuICBbSW52ZW50b3J5U2xvdC5GaW5nZXIxXSAgOiAnRmluZ2VyJyxcbiAgW0ludmVudG9yeVNsb3QuRmluZ2VyMl0gIDogJ0ZpbmdlcicsXG4gIFtJbnZlbnRvcnlTbG90LkNoZXN0XSAgICA6ICdDaGVzdCcsXG4gIFtJbnZlbnRvcnlTbG90LkxlZ3NdICAgICA6ICdMZWdzJyxcbiAgW0ludmVudG9yeVNsb3QuRmVldF0gICAgIDogJ0ZlZXQnLFxuICBbSW52ZW50b3J5U2xvdC5XYWlzdF0gICAgOiAnV2Fpc3QnLFxuICBbSW52ZW50b3J5U2xvdC5BbW1vXSAgICAgOiAnQW1tbycsXG59IGFzIGNvbnN0O1xuXG5leHBvcnQgY29uc3QgZ2V0U2xvdE5hbWVzRnJvbUJpdG1hc2sgPSAoYml0bWFzazogbnVtYmVyKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIEFycmF5LmZyb20obmV3IFNldChPYmplY3QuZW50cmllcyhJbnZlbnRvcnlTbG90TmFtZXMpXG4gICAgLmZpbHRlcigoW3Nsb3QsIF9dKSA9PiAoYml0bWFzayAmICgxIDw8ICtzbG90KSkgIT09IDApXG4gICAgLm1hcCgoWywgbmFtZV0pID0+IG5hbWUpKSkuam9pbignICcpO1xufTsgICBcbiJdfQ==