export function completionState(id,rows,loaded=true){
 if(!loaded)return 'unknown';
 const relevant=rows.filter(r=>r.goal===id);
 const required=['business','celebrate'].includes(id)?1:2;
 if(relevant.length===required&&relevant.every(r=>r.status==='completed'))return 'completed';
 if(id==='training')return 'pending';
 return relevant.some(r=>r.status!=='pending')?'in_progress':'pending';
}
export function canEditPerson(viewerPerson,targetPerson){
 return ['zayan','leo'].includes(viewerPerson)&&(targetPerson==='both'||viewerPerson===targetPerson);
}
export function canManagePhoto(viewerUserId,ownerUserId){
 return !!viewerUserId&&viewerUserId===ownerUserId;
}
export function photoPath(userId,photoId){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!uuid.test(userId)||!uuid.test(photoId))throw new Error('Identificador de foto inválido.');
 return `${userId}/${photoId}.jpg`;
}
export function comparePhotoDates(a,b){
 return a.captured_on.localeCompare(b.captured_on)||String(a.created_at||'').localeCompare(String(b.created_at||''))||a.id.localeCompare(b.id);
}
