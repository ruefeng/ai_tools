document.addEventListener('DOMContentLoaded', () => {
    const fileList = document.getElementById('file-list');
    const yamlDataTextarea = document.getElementById('yaml-data-textarea');
    const j2TemplateTextarea = document.getElementById('j2-template-textarea');
    const generateButton = document.getElementById('generate-button');
    const jsonDataTextarea = document.getElementById('json-data-textarea');
    const generatedConfigTextarea = document.getElementById('generated-config-textarea');

    if (fileList) {
        fileList.addEventListener('click', async (event) => {
            if (event.target.tagName === 'LI') {
                const filename = event.target.dataset.filename;
                try {
                    const response = await fetch(`/main/get_file_content/${filename}`);
                    const data = await response.json();
                    
                    yamlDataTextarea.value = data.yaml_content;
                    j2TemplateTextarea.value = data.j2_content;
                } catch (error) {
                    console.error('获取文件内容失败:', error);
                    alert('获取文件内容失败，请检查控制台。');
                }
            }
        });
    }

    if (generateButton) {
        generateButton.addEventListener('click', async () => {
            const yamlData = yamlDataTextarea.value;
            const j2Template = j2TemplateTextarea.value;

            const jsonData = {
                yaml_data: yamlData,
                j2_template: j2Template
            };

            // 最简单的方法 - 让浏览器自己处理
            const formatted = JSON.stringify(jsonData, null, 2);
            console.log('Formatted JSON:', formatted);
            jsonDataTextarea.value = formatted;

            try {
                const response = await fetch('/main/generate_config', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(jsonData)
                });

                const result = await response.json();

                if (response.ok) {
                    generatedConfigTextarea.value = result.rendered_config;
                } else {
                    alert('生成配置失败: ' + result.message);
                }
            } catch (error) {
                console.error('生成配置失败:', error);
                alert('生成配置失败，请检查网络连接或后端服务。');
            }
        });
    }
});
