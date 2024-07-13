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

3. **Modify the Template File**: Inside the templates directory there is a `sluug.json` file as well as a `stllug.json` file. Modify the appropriate file based on the meeting you are preparing.

## Running the Script

After completing the setup, you can run the script using:

```sh
npm start:sluug
npm start:stllug
```

The script typically takes approximately 1 minute to run depending on OpenAI API response times. 

You can pass the `-v` argument to see verbose output. Example:

```sh
npm start:sluug -- -v
```

## Output

The script outputs to the `dist` directory. After running the script you should see a JSON file and several images. The JSON file will contain the contents of the input file with additional AI-generated information added.

## TODO

- Have AI generate a high-level summary of the key technology. For example, if a presentation is about [Multipass](https://multipass.run/) have the AI generate a couple sentences explaining what Multipass is. Then the visitor to the website can have more information when deciding if they want to attend the meeting or not.
    - Also, use information from references (RAG-ish)
- Consider adding tag to presentationSchema to specify if it is a main presentation
    - main: boolean?
- Add devcontainer
- Extract repetitive openAI API call logic to a function (low priority)
