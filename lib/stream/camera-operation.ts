/** Serializes camera intents while letting Stop invalidate in-flight browser/LiveKit awaits. */
export class CameraOperation {
 private revision=0;
 private pending=false;
 begin():number|null{if(this.pending)return null;this.pending=true;return ++this.revision}
 cancel():void{this.revision++;this.pending=false}
 current(ticket:number):boolean{return ticket===this.revision}
 finish(ticket:number):void{if(this.current(ticket))this.pending=false}
 get busy():boolean{return this.pending}
}
