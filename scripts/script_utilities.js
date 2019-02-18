
const getArgumentsHelper = function(expectedParams) {
	try{
		const arguments = process.argv.slice(4)
	    const index = arguments.indexOf("--network")
	    if (index > -1) {
	      arguments.splice(index, 2)
	    }
	    if (arguments.length != expectedParams) {
	      throw new Error("Error: Numer of arguments for script is incorrect")
	    }
	    return arguments;
	 } catch(error){
	 	console.error(error)
	 }
}

module.exports = getArgumentsHelper