/**
 * Les 7 poses de la figurine : clips d'animation du squelette LF_Rig, exportés depuis
 * Mockups/LoveFaith_Playmobil_V2/LoveFaith_Playmobil_V2_rig.blend (scripts/export_rig_glb.py).
 * `clip` = nom exact de l'action Blender dans le GLB.
 */
export const POSES = [
  { id: 'neutre', clip: 'Pose_1_Neutre', label: 'Neutre', hint: 'Debout, bras relâchés' },
  { id: 'bras-croises', clip: 'Pose_2_Bras_croises', label: 'Bras croisés', hint: 'Croise les bras' },
  { id: 'main-poche', clip: 'Pose_3_Main_dans_la_poche', label: 'Main dans la poche', hint: 'Posture décontractée' },
  { id: 'pouce', clip: 'Pose_4_Pouce_vers_l_avant', label: 'Pouce vers l’avant', hint: 'Montre son pouce' },
  { id: 'regard', clip: 'Pose_5_Regard_de_cote', label: 'Regard de côté', hint: 'Tourne la tête' },
  { id: 'bonnet', clip: 'Pose_6_Ajuste_le_bonnet', label: 'Ajuste le bonnet', hint: 'Main sur le bonnet' },
  { id: 'assis', clip: 'Pose_7_Assis', label: 'Assis', hint: 'S’assoit sur un cube' },
];

export const NEUTRAL_POSE = 'neutre';
export const SEATED_POSE = 'assis';
