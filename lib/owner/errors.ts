export class OwnerError extends Error {constructor(public code:string,public status=403){super(code)}}
