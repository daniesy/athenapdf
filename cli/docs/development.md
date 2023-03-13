# Development

The main ES6 file is `src/main.js`. Plugin-related files are prefixed with `plugin_`.

For local development, start by checking out this repository, and then install the dependencies using `npm install`.

To test your changes, run `./bin/htmlconverter <input_path> [output_path]`. Ensure the aforementioned file has the necessary permissions to be executed (i.e. `chmod +x ./bin/htmlconverter`).

You can use `htmlconverter` globally, and test your changes live by running `npm link` in the `htmlconverter/cli` directory.
