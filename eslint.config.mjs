import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "coverage/**"] },
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // `_name` marks a value that is deliberately dropped (for example when
      // destructuring a field out of an object to omit it).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true
        }
      ],
      // Chat attachments are user-supplied data: and blob: URLs, which
      // next/image cannot optimize.
      "@next/next/no-img-element": "off",
      // These two React Compiler rules flag patterns this app uses on purpose:
      // reading browser storage in an effect after hydration, and keeping a ref
      // in sync with the latest value. Kept visible as warnings.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn"
    }
  }
];

export default config;
