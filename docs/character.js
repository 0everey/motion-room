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

// Character-relative regions; vertex colors are weighted in linear RGB once per base mesh.
CHARACTER_PROFILES.ue4.bodyColors={
 palette:{torso:'#a7b2c2',head:'#edbd58',leftArm:'#30c3d4',rightArm:'#ed775f',leftLeg:'#668ce3',rightLeg:'#69bd7b'},
 roots:{head:'head',clavicle_l:'leftArm',clavicle_r:'rightArm',thigh_l:'leftLeg',thigh_r:'rightLeg'}
};
