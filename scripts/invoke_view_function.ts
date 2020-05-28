import { parseArgs, getBatchExchange } from "./util";
import { factory } from "../src/logging";
const log = factory.getLogger("scripts.invoke_view_function");

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
    const info = await (exchange as any)[functionName].call(...arg);
    log.info(info);
    callback();
  } catch (error) {
    callback(error);
  }
};
