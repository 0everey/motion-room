import {KLEE_SOURCE,KLEE_DEPENDENCIES} from './klee-source.js';
import {YUUKA_SOURCE,YUUKA_DEPENDENCIES} from './yuuka-source.js';
export const MODEL_ASSET="models/herta-7c88eda67cb9.glb";
export const MODEL_SHA256="7c88eda67cb95ce9cbae488d90300eea7e432e52e9884939bbcb3d925aa0d626";
export const MODEL_CREDITS={"character": "大黑塔", "copyright": "miHoYo", "editor": "流云景", "purpose": "非商业公益动作预览"};

// Semantic slots belong to the preview target, independently of the motion source.
const herta={Hips:'Hips',Spine:'Spine',Spine1:'Chest',Spine2:'Chest',Neck:'Neck',Head:'Head'};
const ue4={Hips:'pelvis',Spine:'spine_01',Spine1:'spine_02',Spine2:'spine_03',Neck:'neck_01',Head:'head'};
for(const [side,suffix]of [['Left','L'],['Right','R']]){
 Object.assign(herta,{[side+'UpLeg']:side+' leg',[side+'Leg']:side+' knee',[side+'Foot']:side+' ankle',[side+'ToeBase']:side+' toe',[side+'Shoulder']:side+' shoulder',[side+'Arm']:side+' arm',[side+'ForeArm']:side+' elbow',[side+'Hand']:side+' wrist'});
 const lower=suffix.toLowerCase();Object.assign(ue4,{[side+'UpLeg']:'thigh_'+lower,[side+'Leg']:'calf_'+lower,[side+'Foot']:'foot_'+lower,[side+'ToeBase']:'ball_'+lower,[side+'Shoulder']:'clavicle_'+lower,[side+'Arm']:'upperarm_'+lower,[side+'ForeArm']:'lowerarm_'+lower,[side+'Hand']:'hand_'+lower});
 for(const[finger,target]of [['Thumb','Thumb'],['Index','IndexFinger'],['Middle','MiddleFinger'],['Ring','RingFinger'],['Pinky','LittleFinger']])for(let k=1;k<=3;k++){herta[side+'Hand'+finger+k]=target+(finger==='Thumb'?k-1:k)+'_'+suffix;ue4[side+'Hand'+finger+k]=finger.toLowerCase()+'_0'+k+'_'+lower;}
}
function successors(mapping){const next={Hips:'Spine',Spine:'Spine1',Spine1:'Spine2',Spine2:'Neck',Neck:'Head'};for(const side of ['Left','Right'])Object.assign(next,{[side+'UpLeg']:side+'Leg',[side+'Leg']:side+'Foot',[side+'Foot']:side+'ToeBase',[side+'Shoulder']:side+'Arm',[side+'Arm']:side+'ForeArm',[side+'ForeArm']:side+'Hand',[side+'Hand']:side+'HandMiddle1'});const result={};for(const[from,to]of Object.entries(next))if(mapping[from]!==mapping[to])result[mapping[from]]=mapping[to];return result;}
export const CHARACTER_PROFILES={herta:{key:'herta',label:'大黑塔',asset:MODEL_ASSET,sha256:MODEL_SHA256,hip:'Hips',mapping:herta,next:successors(herta),material:'toon'},ue4:{key:'ue4',label:'UE4 Mannequin',asset:'models/ue4-mannequin-83ea4c910dc2.glb',sha256:'83ea4c910dc29be4b89648a513eef6bd10a9c281e6b52999fbcaa352dddfd187',hip:'pelvis',mapping:ue4,next:successors(ue4),material:'standard'}};
export const DEFAULT_CHARACTER='ue4';

const klee={Hips:'腰',Spine:'上半身',Spine1:'上半身2',Spine2:'上半身2',Neck:'首',Head:'頭'};
const kleeNext={'腰':'上半身','上半身':'上半身2','上半身2':'首','首':'頭'};
for(const [side,j]of [['Left','左'],['Right','右']]){
 Object.assign(klee,{[side+'Shoulder']:j+'肩',[side+'Arm']:j+'腕',[side+'ForeArm']:j+'ひじ',[side+'Hand']:j+'手首',[side+'UpLeg']:j+'足D',[side+'Leg']:j+'ひざD',[side+'Foot']:j+'足首D',[side+'ToeBase']:j+'足先EX'});
 Object.assign(kleeNext,{[j+'肩']:j+'腕',[j+'腕']:j+'ひじ',[j+'ひじ']:j+'手首',[j+'手首']:j+'中指１',[j+'足D']:j+'ひざD',[j+'ひざD']:j+'足首D',[j+'足首D']:j+'足先EX'});
 for(const[finger,jp]of [['Thumb','親指'],['Index','人指'],['Middle','中指'],['Ring','薬指'],['Pinky','小指']])for(let k=1;k<=3;k++)klee[side+'Hand'+finger+k]=j+jp+String.fromCharCode(0xff10+(finger==='Thumb'?k-1:k));
}
CHARACTER_PROFILES.klee={key:'klee',label:'可莉',asset:KLEE_SOURCE.url,format:'official-pmx-zip',source:KLEE_SOURCE,offlineAssets:KLEE_DEPENDENCIES,hip:'腰',mapping:klee,next:kleeNext,material:'toon'};
const yuuka={...klee},yuukaNext={...kleeNext};
for(const [side,j]of [['Left','左'],['Right','右']]){
 Object.assign(yuuka,{[side+'UpLeg']:j+'足',[side+'Leg']:j+'ひざ',[side+'Foot']:j+'足首',[side+'ToeBase']:j+'つま先'});
 delete yuukaNext[j+'足D'];delete yuukaNext[j+'ひざD'];delete yuukaNext[j+'足首D'];
 Object.assign(yuukaNext,{[j+'足']:j+'ひざ',[j+'ひざ']:j+'足首',[j+'足首']:j+'つま先'});
}
CHARACTER_PROFILES.yuuka={key:'yuuka',label:'优香',asset:YUUKA_SOURCE.url,format:'user-pmx-zip',source:YUUKA_SOURCE,offlineAssets:YUUKA_DEPENDENCIES,hip:'腰',mapping:yuuka,next:yuukaNext,material:'toon',preserveMmdSurface:true};

// Character-relative regions; vertex colors are weighted in linear RGB once per base mesh.
CHARACTER_PROFILES.ue4.bodyColors={
 palette:{torso:'#a7b2c2',head:'#edbd58',leftArm:'#30c3d4',rightArm:'#ed775f',leftLeg:'#668ce3',rightLeg:'#69bd7b'},
 roots:{head:'head',clavicle_l:'leftArm',clavicle_r:'rightArm',thigh_l:'leftLeg',thigh_r:'rightLeg'}
};

CHARACTER_PROFILES.ue4.face={bone:'head',up:0,across:2,front:1,frontSign:-1,skin:'#ffdb86',ink:'#162c42',nose:'#bd7425'};
CHARACTER_PROFILES.ue4.headAimAxis=[1,0,0];

// Original body skin and hand chains; source spear and baked shadow removed by the producer.
CHARACTER_PROFILES.orc={"key":"orc","label":"兽人战士","asset":"models/orc-warrior-98b40fe43e5e.glb","hip":"Hips_00","mapping":{"Hips":"Hips_00","Spine":"Waist_01","Spine1":"Mid_02","Spine2":"Chest_03","Neck":"Neck_04","Head":"Head_05","LeftShoulder":"Lclavicle_022","LeftArm":"Lshoulder_023","LeftForeArm":"Lelbow_024","LeftHand":"Lwrist_025","LeftUpLeg":"LThigh_062","LeftLeg":"LKnee_063","LeftFoot":"LAnkle_064","LeftToeBase":"Lfoot_065","RightShoulder":"Rclavicle_042","RightArm":"Rshoulder_043","RightForeArm":"Relbow_044","RightHand":"Rwrist_045","RightUpLeg":"Rthigh_066","RightLeg":"Rknee_067","RightFoot":"Rankle_068","RightToeBase":"Rfoot_069","LeftHandThumb1":"Lthumb1_027","LeftHandThumb2":"Lthumb2_028","LeftHandThumb3":"Lthumb3_029","LeftHandIndex1":"Lindex1_030","LeftHandIndex2":"Lindex2_031","LeftHandIndex3":"Lindex3_032","LeftHandMiddle1":"Lmiddle1_033","LeftHandMiddle2":"Lmiddle2_034","LeftHandMiddle3":"Lmiddle3_035","LeftHandRing1":"Lring1_036","LeftHandRing2":"Lring2_037","LeftHandRing3":"Lring3_038","LeftHandPinky1":"Lpinky1_039","LeftHandPinky2":"Lpinky2_040","LeftHandPinky3":"Lpinky3_041","RightHandThumb1":"Rthumb1_047","RightHandThumb2":"Rthumb2_048","RightHandThumb3":"Rthumb3_049","RightHandIndex1":"Rindex1_050","RightHandIndex2":"Rindex2_051","RightHandIndex3":"Rindex3_052","RightHandMiddle1":"Rmiddle1_053","RightHandMiddle2":"Rmiddle2_054","RightHandMiddle3":"Rmiddle3_055","RightHandRing1":"Rring1_056","RightHandRing2":"Rring2_057","RightHandRing3":"Rring3_058","RightHandPinky1":"Rpinky1_059","RightHandPinky2":"Rpinky2_060","RightHandPinky3":"Rpinky3_061"},"next":{"Hips_00":"Waist_01","Waist_01":"Mid_02","Mid_02":"Chest_03","Chest_03":"Neck_04","Neck_04":"Head_05","Lclavicle_022":"Lshoulder_023","Lshoulder_023":"Lelbow_024","Lelbow_024":"Lwrist_025","Lwrist_025":"Lmiddle1_033","LThigh_062":"LKnee_063","LKnee_063":"LAnkle_064","LAnkle_064":"Lfoot_065","Rclavicle_042":"Rshoulder_043","Rshoulder_043":"Relbow_044","Relbow_044":"Rwrist_045","Rwrist_045":"Rmiddle1_053","Rthigh_066":"Rknee_067","Rknee_067":"Rankle_068","Rankle_068":"Rfoot_069"},"material":"toon","sha256":"98b40fe43e5ef6c6c55740ad6b52c1a0ab7d40a7b3610692b6f069ca0ca6714b","source":{"author":"Callan McEntee","page":"https://sketchfab.com/3d-models/orc-warrior-21eaa407bf164cdea21135a1d1b2b8f3","license":"CC BY 4.0","originalSha256":"b8ee8d95695aa74dc868cf7ab41fc487aa82590b65ea238c0da41bb906627b2b","bytes":1730928}};
CHARACTER_PROFILES.ue4.hiddenSkeletonBones=['ik_foot_root','ik_foot_l','ik_foot_r','ik_hand_root','ik_hand_gun','ik_hand_l','ik_hand_r'];
