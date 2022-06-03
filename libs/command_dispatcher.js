class CommandDispatcher
{
    on(rule = {}) {
        if (this.validate(rule)) {
            this.#dispatch_list.unshift(rule);
            return;
        }
        console.log({INCOLLECT: rule});
        throw `argument is incorrect`;
    }
    
    async dispatch(message) {
        const tokens = message.content.split(' ');
        if (tokens.length == 0) {
            return;
        }
        const obj = {
            name: tokens[0],
            args: tokens.slice(1),
            message: message,
        }
	if (message.content.match(/^(<@\S+>)/)) {
	    return true;
	}

        const target = this.#dispatch_list.find(elem => elem.name == obj.name);
        if (target && target.expr(obj)) {
            await target.do(obj);
            return true;
        }
        if (message.content.match(/<@!\d+>/)) {
            return true;
        }
        
        return false;
    }

    validate(obj) {
        if (
            (obj.name && typeof(obj.name) == 'string') &&
            (obj.expr && typeof(obj.expr) == 'function') &&
            (obj.do && typeof(obj.do) == 'function')
        ) {
            return true;
        }
        return false;
    }
    
    #dispatch_list = [];
}
module.exports = CommandDispatcher;
