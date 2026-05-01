import os
from openai import OpenAI

client = OpenAI(
    api_key="sk-c11a9d9fa0c14bf6a2ad019ed502c6bc",  # 直接传递字符串，不要用 os.environ.get()
    base_url="https://api.deepseek.com/v1",
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