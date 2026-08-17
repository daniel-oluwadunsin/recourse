import { parseEnvironment } from "../packages/config/src/index.js";

const environment = parseEnvironment(process.env);

process.stdout.write(
  `Environment valid: ${environment.APP_ENV} (${environment.NODE_ENV})\n`,
);
