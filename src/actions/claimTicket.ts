///////////////////////////////////////
//TICKET CLAIMING SYSTEM
///////////////////////////////////////
import {opendiscord, api, utilities} from "../index"
import * as discord from "discord.js"

const generalConfig = opendiscord.configs.get("opendiscord:general")

export const registerActions = async () => {
    opendiscord.actions.add(new api.ODAction("opendiscord:claim-ticket"))
    opendiscord.actions.get("opendiscord:claim-ticket").workers.add([
        new api.ODWorker("opendiscord:claim-ticket",2,async (instance,params,source,cancel) => {
            const {guild,channel,user,ticket,reason} = params
            if (channel.isThread()) throw new api.ODSystemError("Unable to claim ticket! Open Ticket doesn't support threads!")

            await opendiscord.events.get("onTicketClaim").emit([ticket,user,channel,reason])
            
            //update ticket
            ticket.get("opendiscord:claimed").value = true
            ticket.get("opendiscord:claimed-by").value = user.id
            ticket.get("opendiscord:claimed-on").value = new Date().getTime()
            ticket.get("opendiscord:busy").value = true

            //update stats
            await opendiscord.stats.get("opendiscord:global").setStat("opendiscord:tickets-claimed",1,"increase")
            await opendiscord.stats.get("opendiscord:user").setStat("opendiscord:tickets-claimed",user.id,1,"increase")

            //update category
            if (typeof params.allowCategoryChange == "boolean" ? params.allowCategoryChange : true){
                const rawClaimCategory = ticket.option.get("opendiscord:channel-categories-claimed").value.find((c) => c.user == user.id)
                const claimCategory = (rawClaimCategory) ? rawClaimCategory.category : null
                if (claimCategory){
                    try {
                        channel.setParent(claimCategory,{lockPermissions:false})
                        ticket.get("opendiscord:category-mode").value = "claimed"
                        ticket.get("opendiscord:category").value = claimCategory
                    }catch(e){
                        opendiscord.log("Unable to move ticket to 'claimed category'!","error",[
                            {key:"channel",value:"#"+channel.name},
                            {key:"channelid",value:channel.id,hidden:true},
                            {key:"categoryid",value:claimCategory}
                        ])
                        opendiscord.debugfile.writeErrorMessage(new api.ODError(e,"uncaughtException"))
                    }
                }
            }

            //update ticket message
            const ticketMessage = await opendiscord.tickets.getTicketMessage(ticket)
            if (ticketMessage){
                try{
                    ticketMessage.edit((await opendiscord.builders.messages.getSafe("opendiscord:ticket-message").build("other",{guild,channel,user,ticket})).message)
                }catch(e){
                    opendiscord.log("Unable to edit ticket message on ticket claiming!","error",[
                        {key:"channel",value:"#"+channel.name},
                        {key:"channelid",value:channel.id,hidden:true},
                        {key:"messageid",value:ticketMessage.id},
                        {key:"option",value:ticket.option.id.value}
                    ])
                    opendiscord.debugfile.writeErrorMessage(new api.ODError(e,"uncaughtException"))
                }
            }

            //reply with new message
            if (params.sendMessage) await channel.send((await opendiscord.builders.messages.getSafe("opendiscord:claim-message").build(source,{guild,channel,user,ticket,reason})).message)
            ticket.get("opendiscord:busy").value = false
            await opendiscord.events.get("afterTicketClaimed").emit([ticket,user,channel,reason])
        }),
        new api.ODWorker("opendiscord:discord-logs",1,async (instance,params,source,cancel) => {
            const {guild,channel,user,ticket,reason} = params

            //to logs
            if (generalConfig.data.system.logs.enabled && generalConfig.data.system.messages.claiming.logs){
                const logChannel = opendiscord.posts.get("opendiscord:logs")
                if (logChannel) logChannel.send(await opendiscord.builders.messages.getSafe("opendiscord:ticket-action-logs").build(source,{guild,channel,user,ticket,mode:"claim",reason,additionalData:null}))
            }

            //to dm
            const creator = await opendiscord.tickets.getTicketUser(ticket,"creator")
            if (creator && generalConfig.data.system.messages.claiming.dm) await opendiscord.client.sendUserDm(creator,await opendiscord.builders.messages.getSafe("opendiscord:ticket-action-dm").build(source,{guild,channel,user,ticket,mode:"claim",reason,additionalData:null}))
        }),
        new api.ODWorker("opendiscord:logs",0,(instance,params,source,cancel) => {
            const {guild,channel,user,ticket} = params

            opendiscord.log(user.displayName+" claimed a ticket!","info",[
                {key:"user",value:user.username},
                {key:"userid",value:user.id,hidden:true},
                {key:"channel",value:"#"+channel.name},
                {key:"channelid",value:channel.id,hidden:true},
                {key:"reason",value:params.reason ?? "/"},
                {key:"method",value:source}
            ])
        })
    ])
    opendiscord.actions.get("opendiscord:claim-ticket").workers.backupWorker = new api.ODWorker("opendiscord:cancel-busy",0,(instance,params) => {
        //set busy to false in case of crash or cancel
        params.ticket.get("opendiscord:busy").value = false
    })
}

export const registerVerifyBars = async () => {
    //CLAIM TICKET TICKET MESSAGE
    opendiscord.verifybars.add(new api.ODVerifyBar("opendiscord:claim-ticket-ticket-message",opendiscord.builders.messages.getSafe("opendiscord:verifybar-ticket-message"),!generalConfig.data.system.disableVerifyBars))
    opendiscord.verifybars.get("opendiscord:claim-ticket-ticket-message").success.add([
        new api.ODWorker("opendiscord:permissions",1,async (instance,params,source,cancel) => {
            const permissionMode = generalConfig.data.system.permissions.claim

            if (permissionMode == "none"){
                //no permissions
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-no-permissions").build("button",{guild:instance.guild,channel:instance.channel,user:instance.user,permissions:[]}))
                return cancel()
            }else if (permissionMode == "everyone") return
            else if (permissionMode == "admin"){
                if (!opendiscord.permissions.hasPermissions("support",await opendiscord.permissions.getPermissions(instance.user,instance.channel,instance.guild))){
                    //no permissions
                    instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-no-permissions").build("button",{guild:instance.guild,channel:instance.channel,user:instance.user,permissions:["support"]}))
                    return cancel()
                }else return
            }else{
                if (!instance.guild || !instance.member){
                    //error
                    instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error").build("button",{guild:instance.guild,channel:instance.channel,user:instance.user,error:"Permission Error: Not in Server #1",layout:"advanced"}))
                    return cancel()
                }
                const role = await opendiscord.client.fetchGuildRole(instance.guild,permissionMode)
                if (!role){
                    //error
                    instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error").build("button",{guild:instance.guild,channel:instance.channel,user:instance.user,error:"Permission Error: Not in Server #2",layout:"advanced"}))
                    return cancel()
                }
                if (!role.members.has(instance.member.id)){
                    //no permissions
                    instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-no-permissions").build("button",{guild:instance.guild,channel:instance.channel,user:instance.user,permissions:[]}))
                    return cancel()
                }else return
            }
        }),
        new api.ODWorker("opendiscord:claim-ticket",0,async (instance,params,source,cancel) => {
            const {guild,channel,user} = instance
            if (!guild){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-not-in-guild").build("button",{channel,user}))
                return cancel()
            }
            const ticket = opendiscord.tickets.get(channel.id)
            if (!ticket || channel.isDMBased()){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-ticket-unknown").build("button",{guild,channel,user}))
                return cancel()
            }
            //return when already claimed
            if (ticket.get("opendiscord:claimed").value){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error").build("button",{guild,channel,user,error:opendiscord.languages.getTranslation("errors.actionInvalid.claim"),layout:"simple"}))
                return cancel()
            }
            //return when busy
            if (ticket.get("opendiscord:busy").value){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-ticket-busy").build("button",{guild,channel,user}))
                return cancel()
            }

            //start claiming ticket
            if (params.data == "reason"){
                //claim with reason
                instance.modal(await opendiscord.builders.modals.getSafe("opendiscord:claim-ticket-reason").build("ticket-message",{guild,channel,user,ticket}))
            }else{
                //claim without reason
                await instance.defer("update",false)
                await opendiscord.actions.get("opendiscord:claim-ticket").run("ticket-message",{guild,channel,user,ticket,reason:null,sendMessage:true})
                await instance.update(await opendiscord.builders.messages.getSafe("opendiscord:ticket-message").build("other",{guild,channel,user,ticket}))
            }
        })
    ])
    opendiscord.verifybars.get("opendiscord:claim-ticket-ticket-message").failure.add([
        new api.ODWorker("opendiscord:back-to-ticket-message",0,async (instance,params,source,cancel) => {
            const {guild,channel,user} = instance
            if (!guild){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-not-in-guild").build("button",{channel,user}))
                return cancel()
            }
            const ticket = opendiscord.tickets.get(channel.id)
            if (!ticket || channel.isDMBased()){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-ticket-unknown").build("button",{guild,channel,user}))
                return cancel()
            }

            await instance.update(await opendiscord.builders.messages.getSafe("opendiscord:ticket-message").build("other",{guild,channel,user,ticket}))
        })
    ])

    //CLAIM TICKET UNCLAIM MESSAGE
    opendiscord.verifybars.add(new api.ODVerifyBar("opendiscord:claim-ticket-unclaim-message",opendiscord.builders.messages.getSafe("opendiscord:verifybar-unclaim-message"),!generalConfig.data.system.disableVerifyBars))
    opendiscord.verifybars.get("opendiscord:claim-ticket-unclaim-message").success.add([
        new api.ODWorker("opendiscord:permissions",1,async (instance,params,source,cancel) => {
            const permissionMode = generalConfig.data.system.permissions.claim

            if (permissionMode == "none"){
                //no permissions
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-no-permissions").build("button",{guild:instance.guild,channel:instance.channel,user:instance.user,permissions:[]}))
                return cancel()
            }else if (permissionMode == "everyone") return
            else if (permissionMode == "admin"){
                if (!opendiscord.permissions.hasPermissions("support",await opendiscord.permissions.getPermissions(instance.user,instance.channel,instance.guild))){
                    //no permissions
                    instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-no-permissions").build("button",{guild:instance.guild,channel:instance.channel,user:instance.user,permissions:["support"]}))
                    return cancel()
                }else return
            }else{
                if (!instance.guild || !instance.member){
                    //error
                    instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error").build("button",{guild:instance.guild,channel:instance.channel,user:instance.user,error:"Permission Error: Not in Server #1",layout:"advanced"}))
                    return cancel()
                }
                const role = await opendiscord.client.fetchGuildRole(instance.guild,permissionMode)
                if (!role){
                    //error
                    instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error").build("button",{guild:instance.guild,channel:instance.channel,user:instance.user,error:"Permission Error: Not in Server #2",layout:"advanced"}))
                    return cancel()
                }
                if (!role.members.has(instance.member.id)){
                    //no permissions
                    instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-no-permissions").build("button",{guild:instance.guild,channel:instance.channel,user:instance.user,permissions:[]}))
                    return cancel()
                }else return
            }
        }),
        new api.ODWorker("opendiscord:claim-ticket",0,async (instance,params,source,cancel) => {
            const {guild,channel,user} = instance
            if (!guild){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-not-in-guild").build("button",{channel,user}))
                return cancel()
            }
            const ticket = opendiscord.tickets.get(channel.id)
            if (!ticket || channel.isDMBased()){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-ticket-unknown").build("button",{guild,channel,user}))
                return cancel()
            }
            //return when already claimed
            if (ticket.get("opendiscord:claimed").value){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error").build("button",{guild,channel,user,error:opendiscord.languages.getTranslation("errors.actionInvalid.claim"),layout:"simple"}))
                return cancel()
            }
            //return when busy
            if (ticket.get("opendiscord:busy").value){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-ticket-busy").build("button",{guild,channel,user}))
                return cancel()
            }

            //start claiming ticket
            if (params.data == "reason"){
                //claim with reason
                instance.modal(await opendiscord.builders.modals.getSafe("opendiscord:claim-ticket-reason").build("unclaim-message",{guild,channel,user,ticket}))
            }else{
                //claim without reason
                await instance.defer("update",false)
                await opendiscord.actions.get("opendiscord:claim-ticket").run("unclaim-message",{guild,channel,user,ticket,reason:null,sendMessage:false})
                await instance.update(await opendiscord.builders.messages.getSafe("opendiscord:claim-message").build("unclaim-message",{guild,channel,user,ticket,reason:null}))
            }
        })
    ])
    opendiscord.verifybars.get("opendiscord:claim-ticket-unclaim-message").failure.add([
        new api.ODWorker("opendiscord:back-to-unclaim-message",0,async (instance,params,source,cancel) => {
            const {guild,channel,user} = instance
            const {verifybarMessage} = params
            if (!guild){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-not-in-guild").build("button",{channel,user}))
                return cancel()
            }
            const ticket = opendiscord.tickets.get(channel.id)
            if (!ticket || channel.isDMBased()){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-ticket-unknown").build("button",{guild,channel,user}))
                return cancel()
            }

            const rawReason = (verifybarMessage && verifybarMessage.embeds[0] && verifybarMessage.embeds[0].fields[0]) ? verifybarMessage.embeds[0].fields[0].value : null
            const reason = (rawReason == null) ? null : rawReason.substring(3,rawReason.length-3)

            await instance.update(await opendiscord.builders.messages.getSafe("opendiscord:unclaim-message").build("other",{guild,channel,user,ticket,reason}))
        })
    ])
}