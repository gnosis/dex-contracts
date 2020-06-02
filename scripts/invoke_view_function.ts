import { getBatchExchange } from "./util";

function parseArgs(): string[] {
  const args = process.argv.slice(4);
  const index = args.indexOf("--network");
  if (index > -1) {
    args.splice(index, 2);
  }
  return args;
}

module.exports = async (callback: Truffle.ScriptCallback) => {
  try {
    const args = parseArgs();
    if (args.length < 1) {
      callback(
        "Error: This script requires arguments - <functionName> [..args]",
      );
    }
    const [functionName, ...arg] = args;
    const exchange = await getBatchExchange(artifacts);
    const info: unknown = await exchange.contract.methods[functionName](
      ...arg,
    ).call();
    // Note that this script is intended to be used for bash scripting and
    // one would usually grep for the results of this execution. Thus,
    // the raw output is printed rather than include irrelevant log details.
    // eslint-disable-next-line no-console
    console.log(info);
    callback();
  } catch (error) {
    callback(error);
  }
};
