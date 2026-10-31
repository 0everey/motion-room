import {KLEE_SOURCE,KLEE_DEPENDENCIES} from './klee-source.js';
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

// Character-relative regions; vertex colors are weighted in linear RGB once per base mesh.
CHARACTER_PROFILES.ue4.bodyColors={
 palette:{torso:'#a7b2c2',head:'#edbd58',leftArm:'#30c3d4',rightArm:'#ed775f',leftLeg:'#668ce3',rightLeg:'#69bd7b'},
 roots:{head:'head',clavicle_l:'leftArm',clavicle_r:'rightArm',thigh_l:'leftLeg',thigh_r:'rightLeg'}
};

CHARACTER_PROFILES.ue4.face={bone:'head',up:0,across:2,front:1,frontSign:-1,skin:'#ffdb86',ink:'#162c42',nose:'#bd7425'};
CHARACTER_PROFILES.ue4.headAimAxis=[1,0,0];
