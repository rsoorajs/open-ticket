import * as fs from "fs"

let tempErrors: string[] = []
const tempError = () => {
    if (tempErrors.length > 0){
        console.log("\n\n==============================\n[OPEN TICKET ERROR]: "+tempErrors.join("\n[OPEN TICKET ERROR]: ")+"\n==============================\n\n")
        process.exit(1)
    }
    tempErrors = []
}

const nodev = process.versions.node.split(".")
if (Number(nodev[0]) < 18){
    tempErrors.push("Invalid node.js version. Open Ticket requires node.js v18 or above!")
}
tempError()

const moduleInstalled = (id:string, throwError:boolean) => {
    try{
        require.resolve(id)
        return true

    }catch{
        if (throwError) tempErrors.push("npm module \""+id+"\" is not installed! Install it via 'npm install "+id+"'")
        return false
    }
}

moduleInstalled("@discordjs/rest",true)
moduleInstalled("discord.js",true)
moduleInstalled("ansis",true)
moduleInstalled("formatted-json-stringify",true)
moduleInstalled("typescript",true)
tempError()

//init API
import * as api from "../api/api" //import for local use
export * as api from "../api/api" //export to other parts of bot


export const opendiscord = new api.ODMain()
console.log("\n--------------------------- OPEN TICKET STARTUP ---------------------------")
opendiscord.log("Logging system activated!","system")
opendiscord.debug.debug("Using Node.js "+process.version+"!")

try{
    const packageJson = JSON.parse(fs.readFileSync("./package.json").toString())
    opendiscord.debug.debug("Using discord.js "+packageJson.dependencies["discord.js"]+"!")
    opendiscord.debug.debug("Using ansis "+packageJson.dependencies["ansis"]+"!")
    opendiscord.debug.debug("Using formatted-json-stringify "+packageJson.dependencies["formatted-json-stringify"]+"!")
    opendiscord.debug.debug("Using typescript "+packageJson.dependencies["typescript"]+"!")
}catch{
    opendiscord.debug.debug("Failed to fetch module versions!")
}

const timer = (ms:number): Promise<void> => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve()
        },ms)
    })
}

export interface ODUtilities {
    /**## project `utility variable`
     * This is the name of the project you are currently in.
     * 
     * Developers can use this to create a multi-plugin compatible with all bots supporting the `open-discord` framework!
     */
    project:"openticket"
    /**## isBeta `utility variable`
     * Check if you're running a beta version of Open Ticket.
     */
    isBeta:boolean
    /**## moduleInstalled `utility function`
     * Use this function to check if an npm package is installed or not!
     * @example utilities.moduleInstalled("discord.js") //check if discord.js is installed
     */
    moduleInstalled(id:string): boolean
    /**## timer `utility function`
     * Use this to wait for a certain amount of milliseconds. This only works when using `await`
     * @example await utilities.timer(1000) //wait 1sec
     */
    timer(ms:number): Promise<void>
    /**## emojiTitle `utility function`
     * Use this function to create a title with an emoji before/after the text. The style & divider are set in `opendiscord.defaults`
     * @example utilities.emojiTitle("📎","Links") //create a title with an emoji based on the bot emoji style
     */
    emojiTitle(emoji:string, text:string): string
    /**## runAsync `utility function`
     * Use this function to run a snippet of code asyncronous without creating a separate function for it!
     */
    runAsync(func:() => Promise<void>): void
    /**## timedAwait `utility function`
     * Use this function to await a promise but reject after the certain timeout has been reached.
     */
    timedAwait<ReturnValue extends Promise<any>>(promise:ReturnValue, timeout:number, onError:(err:Error) => void): ReturnValue
    /**## dateString `utility function`
     * Use this function to create a short date string in the following format: `DD/MM/YYYY HH:MM:SS`
     */
    dateString(date:Date): string
    /**## asyncReplace `utility function`
     * Same as `string.replace(search, value)` but with async compatibility
     */
    asyncReplace(text:string, regex:RegExp, func:(value:string,...args:any[]) => Promise<string>): Promise<string>
    /**## easterEggs `utility object`
     * Object containing data for Open Ticket easter eggs.
     */
    easterEggs: api.ODEasterEggs,
    /**## ODVersionMigration `utility class`
     * This class is used to manage data migration between Open Ticket versions.
     * 
     * It shouldn't be used by plugins because this is an internal API feature!
     */
    ODVersionMigration:new (version:api.ODVersion,func:() => void|Promise<void>,afterInitFunc:() => void|Promise<void>) => ODVersionMigration
}

/**## ODVersionMigration `utility class`
 * This class is used to manage data migration between Open Ticket versions.
 * 
 * It shouldn't be used by plugins because this is an internal API feature!
 */
export class ODVersionMigration {
    /**The version to migrate data to */
    version: api.ODVersion
    /**The migration function */
    #func: () => void|Promise<void>
    /**The migration function */
    #afterInitFunc: () => void|Promise<void>

    constructor(version:api.ODVersion,func:() => void|Promise<void>,afterInitFunc:() => void|Promise<void>){
        this.version = version
        this.#func = func
        this.#afterInitFunc = afterInitFunc
    }
    /**Run this version migration as a plugin. Returns `false` when something goes wrong. */
    async migrate(): Promise<boolean> {
        try{
            await this.#func()
            return true
        }catch{
            return false
        }
    }
    /**Run this version migration as a plugin (after other plugins have loaded). Returns `false` when something goes wrong. */
    async migrateAfterInit(): Promise<boolean> {
        try{
            await this.#afterInitFunc()
            return true
        }catch{
            return false
        }
    }
}

export const utilities: ODUtilities = {
    project:"openticket",
    isBeta:false,
    moduleInstalled:(id:string) => {
        return moduleInstalled(id,false)
    },
    timer,
    emojiTitle(emoji:string, text:string){
        const style = opendiscord.defaults.getDefault("emojiTitleStyle")
        const divider = opendiscord.defaults.getDefault("emojiTitleDivider")

        if (style == "disabled") return text
        else if (style == "before") return emoji+divider+text
        else if (style == "after") return text+divider+emoji
        else if (style == "double") return emoji+divider+text+divider+emoji
        else return text
    },
    runAsync(func){
        func()
    },
    timedAwait<ReturnValue>(promise:ReturnValue,timeout:number,onError:(err:Error) => void): ReturnValue {
        let allowResolve = true
        return new Promise(async (resolve,reject) => {
            //set timeout & stop if it is before the promise resolved
            setTimeout(() => {
                allowResolve = false
                reject("utilities.timedAwait() => Promise Timeout")
            },timeout)

            //get promise result & return if not already rejected
            try{
                const res = await promise
                if (allowResolve) resolve(res)
            }catch(err){
                onError(err)
            }
        return promise
        }) as ReturnValue
    },
    dateString(date): string {
        return `${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`
    },
    async asyncReplace(text,regex,func): Promise<string> {
        const promises: Promise<string>[] = []
        text.replace(regex,(match,...args) => {
            promises.push(func(match,...args))
            return match
        })
        const data = await Promise.all(promises)
        const result = text.replace(regex,(match) => {
            const replaceResult = data.shift()
            return replaceResult ?? match
        })
        return result
    },
    easterEggs:{
        /* THANK YOU TO ALL OUR CONTRIBUTORS!!! */
        creator:"779742674932072469", //DJj123dj
        translators:[
            "779742674932072469", //DJj123dj
            "574172558006681601", //Sanke
            "540639725300613136", //Guillee.3
            "547231585368539136", //Mods HD
            "664934139954331649", //SpyEye
            "498055992962187264", //Redactado
            "912052735950618705", //T0miiis
            "366673202610569227", //johusens
            "360780292853858306", //David.3
            "950611418389024809", //Sarcastic
            "461603955517161473", //Maurizo
            "465111430274875402", //The_Gamer
            "586376952470831104", //Erxg
            "226695254433202176", //Mkevas
            "437695615095275520", //NoOneNook
            "530047191222583307", //Anderskiy
            "719072181631320145", //ToStam
            "1172870906377408512", //Stragar
            "1084794575945744445", //Sasanwm
            "449613814049275905", //Benzorich
            "905373133085741146", //Ronalds
            "918504977369018408", //Palestinian
            "807970841035145216", //Kornel0706
            "1198883915826475080", //Nova
            "669988226819162133", //Danoglez
            "1313597620996018271", //Fraden1
            "547809968145956884", //TsgIndrius
            "264120132660363267", //Quiradon
            "1272034143777329215", //NotMega
            "LOREMIPSUM", //TODO
        ]
    },
    ODVersionMigration
}