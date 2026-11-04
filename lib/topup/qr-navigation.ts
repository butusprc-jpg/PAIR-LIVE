/** LINE has both LIFF browser and LINE's in-app browser. isInClient() is
 * false for the latter; both must use the explicit external open request.
 */
export function isLineWebView(userAgent:string):boolean{
 return /(?:^|[\s;])Line\/\d+/i.test(userAgent);
}
