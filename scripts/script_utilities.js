
const getArgumentsHelper = function() {
  const arguments = process.argv.slice(4)
  const index = arguments.indexOf("--network")
  if (index > -1) {
    arguments.splice(index, 2)
  }
  return arguments
}

module.exports = getArgumentsHelper