# SLUUG/STLLUG Marketing Content Generation

The code in this repository is used to supplement our regular meeting content with "marketing" material that can be used to spread the word about our SLUUG and STLLUG meetings. This content includes things like:

- Enthusiastic tweets that encourage people to attend the meeting.
- Titles we can use when the recording of the meeting is posted to YouTube.
- Images that can be used on the website and as a Thumbnail for the YouTube video.

# Running the Script

This guide will help you run the script. Follow these steps to get started:

## Prerequisites

- This script has been tested to work on Bash and Powershell v7 (`pwsh.exe` not the old `powershell.exe`).
- Ensure you have `Node.js` installed on your system. The recommended version is specified in the [.nvmrc](./.nvmrc) file.
- This script uses the OpenAI API. To use it, you need an OpenAI API Key. Follow these steps to get your key and set it as an environment variable:
    1. Visit the [OpenAI API Keys](https://platform.openai.com/api-keys) page and sign up or log in and create an API key.
    2. Once you have your API key, set it as an environment variable on your system:
        - **On Bash**: Open your `.bashrc` file in a text editor and add the following line:
            ```sh
            export OPENAI_API_KEY='your_api_key_here'
            ```
            Replace `your_api_key_here` with your actual API key. Then, save the file and run `source ~/.bashrc` to apply the changes.
        - **On PowerShell**: Open PowerShell and run the following command:
            ```powershell
            [System.Environment]::SetEnvironmentVariable('OPENAI_API_KEY', 'your_api_key_here', [System.EnvironmentVariableTarget]::User)
            ```
            Replace `your_api_key_here` with your actual API key. This will set the API key for the current user. You will need to restart PowerShell for the changes to take effect.

## OpenAI API Cost

OpenAI API prices fluctuate. As of 2024-06-15, each run of this script costs approximately fifteen cents. ($0.15)

## Setup

1. **Clone the Repository**: Clone this repository to your local machine using your preferred Git client or the command line:

    ```sh
    git clone git@github.com:seantwie03/sluug_stllug_generation.git
    ```

2. **Install Dependencies**: Navigate to the root directory of the cloned repository and install the required Node.js dependencies:

    ```sh
    cd ./sluug_stllug_generation
    npm install
    ```

3. **Create the Input File**: You need to create or obtain a JSON file that contains the meeting information. This script parses the file name to know the meeting date and meeting type (SLUUG or STLLUG). In order to parse correctly the input file must follow this naming convention:

    - The first 10 digits of the file name are the date of the meeting in `YYYY-MM-DD` format.
        - Example for January 21, 2021: 2021-01-21
    - The end of the file name must be exactly `stllug.json` or `sluug.json`.
    - See the files [test_data](test_data) folder for full examples.

    The content inside the file must be valid JSON and follow a specific schema in order to parse correctly. At a minimum, the JSON file must have all the fields shown in the [test_data\2021-01-21_stllug.json](test_data\2021-01-21_stllug.json) example file. Ideally, you would add a bit of additional information, such as the `meetupUrl` and `references` as shown in the [test_data\2021-01-13_sluug.json](test_data\2021-01-13_sluug.json) example file. The script uses [zod](https://github.com/colinhacks/zod) to validate that the file contents matches this schema. If a mandatory field is missing you will receive an error message in your terminal.

## Running the Script

After completing the setup, you can run the script using:

```sh
npm start -- <path-to-your-input-file>
```

For example, if your input file is located in the root of the project:

```sh
npm start -- ./2024-02-14_sluug.json
```

The script typically takes approximately 45 seconds to run depending on OpenAI API response times. 

You can pass the `-v` argument to see verbose output.

## Output

The script outputs to the `dist` directory. After running the script you should see a JSON file and several images. The JSON file will contain the contents of the input file with additional AI-generated information added.

To use these files on the `sluug_stllug_site`, copy them into the appropriate content directory.

## Possible Improvements

- Have AI generate a high-level summary of the key technology. For example, if a presentation is about [Multipass](https://multipass.run/) have the AI generate a couple sentences explaining what Multipass is. Then the visitor to the website can have more information when deciding if they want to attend the meeting or not.
    - Also, use information from references (RAG-ish)
- Modify the call to generate tags. Ask the AI to identify the key technology. Then as the AI to identify the key technique or concept. This may produce better results than asking the AI to generate 1-2 tags based on the key technology, technique, or concept of the presentation.
- Modify the call to generate YouTube titles to be like the call to generate images. If there are multiple presentations, generate one title for the base, one for the main, and one combined. If there is only a single presentation generate three titles for it.
- Extract repetitive openAI API call logic to a function (low priority)
