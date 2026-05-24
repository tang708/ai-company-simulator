import os
import os
from dotenv import load_dotenv
load_dotenv()
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv('DEEPSEEK_API_KEY'),
    base_url=os.getenv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com/v1'),
)

response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=[
        {"role": "system", "content": "You are a helpful assistant"},
        {"role": "user", "content": "Hello!"}
    ],
    stream=False,
)

print(response.choices[0].message.content)