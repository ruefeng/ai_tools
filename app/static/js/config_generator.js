document.addEventListener('DOMContentLoaded', () => {
    const templateSelect = document.getElementById('template-select');
    const yamlDataTextarea = document.getElementById('yaml-data-textarea');
    const j2TemplateTextarea = document.getElementById('j2-template-textarea');
    const generateButton = document.getElementById('generate-button');
    const jsonDataTextarea = document.getElementById('json-data-textarea');
    const generatedConfigTextarea = document.getElementById('generated-config-textarea');

    async function loadTemplate(filename) {
        if (!filename) {
            yamlDataTextarea.value = '';
            j2TemplateTextarea.value = '';
            return;
        }

        try {
            const response = await fetch(`/main/get_file_content/${filename}`);
            const data = await response.json();
            yamlDataTextarea.value = data.yaml_content || '';
            j2TemplateTextarea.value = data.j2_content || '';
        } catch (error) {
            console.error('获取文件内容失败:', error);
            alert('获取文件内容失败，请检查控制台。');
        }
    }

    if (templateSelect) {
        templateSelect.addEventListener('change', (event) => {
            loadTemplate(event.target.value);
        });

        if (templateSelect.options.length > 1) {
            templateSelect.selectedIndex = 1;
            loadTemplate(templateSelect.value);
        }
    }

    if (generateButton) {
        generateButton.addEventListener('click', async () => {
            const yamlData = yamlDataTextarea.value;
            const j2Template = j2TemplateTextarea.value;

            if (!j2Template.trim()) {
                alert('请先选择或填写 J2 模板');
                return;
            }

            const jsonData = {
                yaml_data: yamlData,
                j2_template: j2Template
            };

            jsonDataTextarea.value = JSON.stringify(jsonData, null, 2);

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
